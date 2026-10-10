import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeChunkCoordinates } from "./pcaProjection.ts";
import { embed } from "../_shared/embed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Chunking ───────────────────────────────────────────────────────────────────

const TARGET_TOKENS = 600;
const MAX_CHARS = TARGET_TOKENS * 4;
const OVERLAP_PARAS = 1;

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const paragraphs = normalized.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  const pushChunk = () => {
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [];
      currentLength = 0;
    }
  };

  for (const para of paragraphs) {
    if (para.length > MAX_CHARS) {
      pushChunk();
      let lineBuf = "";
      for (const line of para.split("\n")) {
        if (lineBuf && lineBuf.length + line.length + 1 > MAX_CHARS) {
          chunks.push(lineBuf);
          lineBuf = line;
        } else {
          lineBuf = lineBuf ? `${lineBuf}\n${line}` : line;
        }
        while (lineBuf.length > MAX_CHARS) {
          chunks.push(lineBuf.slice(0, MAX_CHARS));
          lineBuf = lineBuf.slice(MAX_CHARS);
        }
      }
      if (lineBuf) chunks.push(lineBuf);
      continue;
    }

    if (currentLength + para.length > MAX_CHARS && currentChunk.length > 0) {
      pushChunk();

      const overlapStart = Math.max(0, currentChunk.length - OVERLAP_PARAS);
      currentChunk = currentChunk.slice(overlapStart);
      currentLength = currentChunk.reduce((sum, p) => sum + p.length, 0);
    }

    currentChunk.push(para);
    currentLength += para.length;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));

  if (chunks.length === 0 && normalized.trim().length > 0) {
    for (let i = 0; i < normalized.length; i += MAX_CHARS) {
      chunks.push(normalized.slice(i, i + MAX_CHARS));
    }
  }

  return chunks;
}

// ── Embedding ──────────────────────────────────────────────────────────────────

const VOYAGE_MIN_INTERVAL_MS = 20_000;
const VOYAGE_BATCH_SIZE = 4;



function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}



// ── Self-chaining ──────────────────────────────────────────────────────────────

async function spawnNextInvocation(documentId: string, userId: string) {
  try {
    const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    await fetch(`${baseUrl}/functions/v1/process-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${svcKey}`,
        apikey: svcKey,
      },
      body: JSON.stringify({ document_id: documentId, user_id: userId, is_chain: true }),
    });
  } catch (err) {
    console.error("Failed to spawn next process-document invocation:", err);
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { document_id, user_id, is_chain } = await req.json();

    let supabase;
    let currentUserId: string;
    let serviceRoleClient;

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const isAdmin = authHeader === `Bearer ${serviceRoleKey}`;

    if (isAdmin) {
      supabase = createClient(supabaseUrl, serviceRoleKey);
      serviceRoleClient = supabase;
      if (!user_id) {
        return jsonResponse({ error: "user_id is required for service role calls" }, 400);
      }
      currentUserId = user_id;
    } else {
      if (!authHeader) {
        return jsonResponse({ error: "Missing Authorization header" }, 401);
      }

      supabase = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      serviceRoleClient = createClient(supabaseUrl, serviceRoleKey);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      currentUserId = user.id;
    }

    if (!document_id) {
      return jsonResponse({ error: "document_id is required" }, 400);
    }

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, name, extracted_text, content_text, user_id, status")
      .eq("id", document_id)
      .eq("user_id", currentUserId)
      .single();

    if (docError || !doc) {
      return jsonResponse({ error: "Document not found" }, 404);
    }

    const text = doc.extracted_text || doc.content_text || "";
    if (!text.trim()) {
      await supabase
        .from("documents")
        .update({ status: "failed", error_message: "No text content to process" })
        .eq("id", document_id);
      return jsonResponse({ error: "No text content in document" }, 400);
    }

    if (!is_chain) {
      // Clean slate for new vectorization or reprocess
      await supabase
        .from("document_chunks")
        .delete()
        .eq("document_id", document_id);
    }

    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document_id);

    const chunks = chunkText(text);
    console.log(`[Chunking] Document "${doc.name}" (${text.length} chars) → ${chunks.length} chunks`);
    if (chunks.length === 0) {
      await supabase
        .from("documents")
        .update({ status: "failed", error_message: "No chunks could be created from text" })
        .eq("id", document_id);
      return jsonResponse({ error: "No chunks created" }, 400);
    }

    const totalChunks = chunks.length;

    const { count } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", document_id);

    const processed = count || 0;

    if (processed >= totalChunks) {
      // Fetch embeddings through the RPC
      const { data: rows, error: rpcError } = await serviceRoleClient.rpc("get_document_embeddings", {
        p_doc: document_id
      });

      if (rpcError || !rows || rows.length === 0) {
        return jsonResponse({ error: "No chunks to finalize or RPC failed" }, 500);
      }

      const ordered = rows.sort((a, b) => a.chunk_index - b.chunk_index);
      const embeddings = ordered.map((r) => JSON.parse(r.emb) as number[]);

      const { coords, model: pcaModel } = computeChunkCoordinates(
        embeddings.map((e) => e.slice(0, 256))
      );

      // Save coordinates via RPC to avoid management token for updates
      const coordPayload = ordered.map((r, i) => ({
        id: r.id,
        x: coords[i]?.x ?? 0,
        y: coords[i]?.y ?? 0
      }));

      const { error: coordsError } = await serviceRoleClient.rpc("set_chunk_coords", {
        p_doc: document_id,
        p_coords: coordPayload
      });
      if (coordsError) {
         console.warn("Failed to set chunk coordinates", coordsError);
      }

      await supabase
        .from("documents")
        .update({ status: "ready", pca_model: JSON.stringify(pcaModel), processed: true })
        .eq("id", document_id);

      return jsonResponse({
        success: true,
        document_id,
        chunks_created: totalChunks,
        status: "ready",
      });
    }

    await sleep(VOYAGE_MIN_INTERVAL_MS);

    const batch = chunks.slice(processed, processed + VOYAGE_BATCH_SIZE);
    console.log(`[Embedding] Processing batch: chunks ${processed}–${processed + batch.length - 1}/${chunks.length}`);
    const normalizedEmbeddings = await embed(batch, 'document');
    console.log(`[Embedding] Generated ${normalizedEmbeddings.length} embeddings`);

    const chunkRows = batch.map((content, i) => ({
      document_id,
      user_id: currentUserId,
      chunk_index: processed + i,
      content,
      embedding: normalizedEmbeddings[i] || null,
      token_count: Math.ceil(content.length / 4),
      x_coordinate: null,
      y_coordinate: null,
    }));

    const { error: insertError } = await supabase
      .from("document_chunks")
      .insert(chunkRows);

    if (insertError) {
      console.error("Failed to insert chunks:", insertError);
      await supabase
        .from("documents")
        .update({ status: "failed", error_message: insertError.message })
        .eq("id", document_id);
      return jsonResponse({ error: insertError.message }, 500);
    }

    const done = processed + batch.length;
    console.log(`[Embedding] Stored ${chunkRows.length} chunks in document_chunks table (total: ${done}/${chunks.length})`);

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(spawnNextInvocation(document_id, currentUserId));
    } else {
      spawnNextInvocation(document_id, currentUserId);
    }

    return jsonResponse({
      success: true,
      document_id,
      status: done < totalChunks ? "processing" : "finalizing",
      chunks_processed: done,
      total_chunks: totalChunks,
      model_used: 'voyage-3',
    });
  } catch (error) {
    console.error("process-document error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
