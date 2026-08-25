import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface PcaModel {
  loadings: number[][];
  center: number[];
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
}

function projectQuery(
  embedding: number[],
  model: PcaModel
): { x: number; y: number } {
  const { loadings, center, bounds } = model;
  if (!loadings.length) return { x: 0, y: 0 };

  const centered = embedding.map((v, i) => v - (center[i] ?? 0));
  const rawX = centered.reduce((sum, v, i) => sum + v * (loadings[i]?.[0] ?? 0), 0);
  const rawY = centered.reduce((sum, v, i) => sum + v * (loadings[i]?.[1] ?? 0), 0);

  const range = 100;
  const xSpan = bounds.xMax - bounds.xMin || 1;
  const ySpan = bounds.yMax - bounds.yMin || 1;

  return {
    x: ((rawX - bounds.xMin) / xSpan) * range - range / 2,
    y: ((rawY - bounds.yMin) / ySpan) * range - range / 2,
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

// Query embeddings must match the VECTOR(1536) column used by
// match_document_chunks. Voyage-3 returns 1024-dim vectors, so pad to 1536.
const EMBEDDING_DIM = 1536;

function padEmbedding(emb: number[]): number[] {
  if (emb.length === EMBEDDING_DIM) return emb;
  if (emb.length > EMBEDDING_DIM) return emb.slice(0, EMBEDDING_DIM);
  return [...emb, ...new Array(EMBEDDING_DIM - emb.length).fill(0)];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function embedQuery(
  query: string
): Promise<{ embedding: number[]; model: string }> {
  const useVoyage = !!VOYAGE_API_KEY;
  if (useVoyage) {
    try {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "voyage-3",
          input: [query],
          input_type: "query",
        }),
      });

      if (res.ok) {
        const json = await res.json();
        return {
          embedding: padEmbedding((json as { data: Array<{ embedding: number[] }> }).data[0].embedding),
          model: "voyage-3",
        };
      }
      console.warn("Voyage query embedding failed, trying OpenAI fallback");
    } catch (err) {
      console.warn("Voyage query embedding error:", err);
    }
  }

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: [query],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ||
        `OpenAI API error: ${res.status}`
    );
  }

  const json = await res.json();
  return {
    embedding: (json as { data: Array<{ embedding: number[] }> }).data[0].embedding,
    model: "text-embedding-3-small",
  };
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  provider: string
): Promise<string> {
  if (provider === "anthropic") {
    const key = apiKey || ANTHROPIC_API_KEY || "";
    if (!key) throw new Error("No API key for Anthropic");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system:
          "You are DocuTalk AI, a document-grounded assistant. Answer using ONLY the context provided. If the answer isn't in the context, say so. Cite the source document and chunk index for each piece of information you use.",
        messages: messages.slice(-20),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } }).error?.message ||
          `Anthropic API error: ${res.status}`
      );
    }

    const json = await res.json();
    return (json as { content: Array<{ text: string }> }).content[0]?.text || "";
  }

  if (provider === "openai") {
    const key = OPENAI_API_KEY || "";
    if (!key) throw new Error("No API key for OpenAI");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are DocuTalk AI, a document-grounded assistant. Answer using ONLY the context provided. If the answer isn't in the context, say so. Cite the source document and chunk index for each piece of information you use.",
          },
          ...messages.slice(-20),
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } }).error?.message ||
          `OpenAI API error: ${res.status}`
      );
    }

    const json = await res.json();
    return (
      (json as { choices: Array<{ message: { content: string } }> }).choices[0]
        ?.message?.content || ""
    );
  }

  if (provider === "groq") {
    const key = apiKey || GROQ_API_KEY || "";
    if (!key) throw new Error("No API key for Groq");

    const groqModels = [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ];

    let lastError = "";
    for (const model of groqModels) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are DocuTalk AI, a document-grounded assistant. Answer using ONLY the context provided. If the answer isn't in the context, say so. Cite the source document and chunk index for each piece of information you use.",
              },
              ...messages.slice(-20),
            ],
            max_tokens: 4096,
            temperature: 0.3,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          return json.choices?.[0]?.message?.content || "";
        }

        const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        lastError = errBody?.error?.message || `HTTP ${res.status}`;
        console.warn(`Groq model "${model}" failed: ${lastError}`);
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`Groq model "${model}" fetch error:`, fetchErr);
      }
    }

    throw new Error(`All Groq models failed. Last error: ${lastError}`);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const {
      message,
      history = [],
      document_ids = [],
      provider = "groq",
      apiKey = "",
    } = await req.json();

    if (!message) {
      return jsonResponse({ error: "message is required" }, 400);
    }

    let sources: Array<{
      id: string;
      document_id: string;
      document_name: string;
      chunk_index: number;
      content: string;
      content_snippet: string;
      similarity: number;
      x_coordinate: number | null;
      y_coordinate: number | null;
    }> = [];

    let contextBlock = "";
    let queryCoordinate: { x: number; y: number; document_id: string } | null = null;

    if (document_ids.length > 0) {
      try {
        console.log(`[RAG-Chat] Query: "${message}"`);
        console.log(`[RAG-Chat] Searching in ${document_ids.length} active document(s)`);
        const { embedding } = await embedQuery(message);
        console.log(`[RAG-Chat] Query embedding generated (${embedding.length} dimensions)`);

        const { data: chunks, error: matchError } = await supabase.rpc(
          "match_document_chunks",
          {
            query_embedding: embedding,
            match_user_id: user.id,
            match_count: 8,
            match_threshold: 0.3,
          }
        );

        if (matchError) {
          console.warn("Vector search failed:", matchError);
        } else if (chunks && (chunks as Array<Record<string, unknown>>).length > 0) {
          console.log(`[RAG-Chat] Vector search returned ${(chunks as Array<Record<string, unknown>>).length} matches`);
          const filtered = (chunks as Array<Record<string, unknown>>).filter(
            (c) => document_ids.includes(c.document_id as string)
          );

          console.log(`[RAG-Chat] After filtering by active documents: ${filtered.length} chunks`);
          const top = filtered.slice(0, 8);
          console.log(`[RAG-Chat] Retrieved top ${top.length} chunks:`);
          top.forEach((c, i) => {
            const sim = (c.similarity as number) || 0;
            const docName = (c.document_name as string) || "Unknown";
            const chunkIdx = (c.chunk_index as number) || 0;
            const content = ((c.content as string) || "").slice(0, 150).replace(/\n/g, " ");
            console.log(`  [${i}] "${docName}" chunk ${chunkIdx} (similarity: ${sim.toFixed(3)}): ${content}...`);
          });

          sources = top.map(
            (c: Record<string, unknown>) =>
              ({
                id: c.id as string,
                document_id: c.document_id as string,
                document_name: (c.document_name as string) || "Unknown",
                chunk_index: (c.chunk_index as number) || 0,
                content: (c.content as string) || "",
                content_snippet: ((c.content as string) || "").slice(0, 200),
                similarity: (c.similarity as number) || 0,
                x_coordinate: (c.x_coordinate as number) ?? null,
                y_coordinate: (c.y_coordinate as number) ?? null,
              } as typeof sources[0])
          );

          contextBlock = top
            .map(
              (c: Record<string, unknown>) =>
                `<document source="${(c.document_name as string) || "Unknown"}" chunk="${(c.chunk_index as number) || 0}">\n${c.content as string}\n</document>`
            )
            .join("\n\n");
        }
        // Project query embedding into 2D using first available document's PCA model
        if (sources.length > 0) {
          const docId = sources[0].document_id;
          const { data: pcaDoc } = await supabase
            .from("documents")
            .select("pca_model")
            .eq("id", docId)
            .single();

          if (pcaDoc?.pca_model) {
            try {
              const model = JSON.parse(
                typeof pcaDoc.pca_model === "string"
                  ? pcaDoc.pca_model
                  : JSON.stringify(pcaDoc.pca_model)
              ) as PcaModel;
              const qc = projectQuery(embedding, model);
              queryCoordinate = { x: qc.x, y: qc.y, document_id: docId };
            } catch {
              // PCA projection failed silently
            }
          }
        }
      } catch (vecErr) {
        console.warn("Vector search error:", vecErr);
      }
    }

    if (!contextBlock && document_ids.length > 0) {
      // Fallback: fetch full document text directly (covers the case where
      // a document was just attached but chunking hasn't completed yet)
      try {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, name, content_text")
          .in("id", document_ids)
          .eq("user_id", user.id);

        if (docs && docs.length > 0) {
          contextBlock = docs
            .map(
              (d: { id: string; name: string; content_text?: string }) =>
                `<document source="${d.name}">\n${(d.content_text || "").slice(0, 3000)}\n</document>`
            )
            .join("\n\n");

          sources = docs.map(
            (d: { id: string; name: string; content_text?: string }) =>
              ({
                id: d.id,
                document_id: d.id,
                document_name: d.name,
                chunk_index: 0,
                content: d.content_text || "",
                content_snippet: "",
                similarity: 0,
                x_coordinate: null,
                y_coordinate: null,
              } as typeof sources[0])
          );
        }
      } catch (fallbackErr) {
        console.warn("Fallback document fetch failed:", fallbackErr);
      }
    }

    const systemMessage = {
      role: "system" as const,
      content: contextBlock
        ? `You are DocuTalk AI, a document-grounded assistant.

Answer using ONLY the context provided below. If the information isn't in the context, say "I couldn't find that in the provided documents."

Always cite the source document name and chunk index for each piece of information.

Context:
${contextBlock}`
        : `You are DocuTalk AI, an intelligent document assistant. Answer the user's question to the best of your ability. If no document context is available, let them know and offer suggestions (upload files, paste text, etc.).`,
    };

    const llmMessages = [systemMessage, ...history, { role: "user" as const, content: message }];

    console.log(`[RAG-Chat] Prompt Construction:`);
    console.log(`  System message length: ${systemMessage.content.length} chars`);
    console.log(`  Context block present: ${contextBlock.length > 0}`);
    if (contextBlock.length > 0) {
      console.log(`  Context block size: ${contextBlock.length} chars`);
      console.log(`  First 500 chars of context:\n${contextBlock.slice(0, 500)}`);
    }
    console.log(`  History messages: ${history.length}`);
    console.log(`  Total LLM messages: ${llmMessages.length}`);
    console.log(`[RAG-Chat] Calling ${provider} LLM...`);

    const response = await callLLM(llmMessages, apiKey, provider);

    console.log(`[RAG-Chat] LLM Response (first 300 chars): ${response.slice(0, 300)}...`);

    return jsonResponse({
      response,
      sources,
      vectorSearch: !!contextBlock,
      query_coordinate: queryCoordinate,
    });
  } catch (error) {
    console.error("rag-chat error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
