import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ROWS_PER_TABLE = 500;
const MAX_TABLES = 50;

// Ensure required environment variables are set
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

interface DataSourceRow {
  id: string;
  name: string;
  type: string;
  connection_string: string | null;
  user_id: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serializeTableRows(
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[]
): string {
  const header = `Table: ${tableName}\nColumns: ${columns.join(", ")}\nTotal rows synced: ${rows.length}\n\n`;
  if (rows.length === 0) {
    return `${header}(empty table)\n`;
  }

  const body = rows
    .map((row, index) => {
      const fields = columns
        .map((col) => `${col}=${formatValue(row[col])}`)
        .join(", ");
      return `Row ${index + 1}: ${fields}`;
    })
    .join("\n");

  return `${header}${body}\n`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function loadDataSource(
  dataSourceId: string,
  userId: string
): Promise<DataSourceRow | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase environment variables");
    return null;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await admin
    .from("data_sources")
    .select("id, name, type, connection_string, user_id")
    .eq("id", dataSourceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as DataSourceRow;
}

async function updateSyncStatus(
  dataSourceId: string,
  status: string,
  errorMessage?: string
) {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await admin
      .from("data_sources")
      .update({
        sync_status: status,
        sync_error: errorMessage ?? null,
        last_synced_at: status === "synced" ? new Date().toISOString() : null,
      })
      .eq("id", dataSourceId);
  } catch (err) {
    console.warn("Could not update sync status (run latest DB migration):", err);
  }
}

async function testPostgresConnection(connectionString: string) {
  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const result = await sql<{ ok: number }[]>`SELECT 1 as ok`;
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT ${MAX_TABLES}
    `;

    return {
      ok: true,
      tableCount: tables.length,
      tables: tables.map((t) => t.table_name),
      ping: result[0]?.ok === 1,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function syncPostgresToDocuments(
  source: DataSourceRow,
  userId: string
) {
  if (!source.connection_string) {
    throw new Error("Connection string is missing for this data source.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const sql = postgres(source.connection_string, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT ${MAX_TABLES}
    `;

    if (tables.length === 0) {
      throw new Error("No public tables found in the connected database.");
    }

    try {
      await admin
        .from("documents")
        .delete()
        .eq("data_source_id", source.id)
        .eq("user_id", userId);
    } catch {
      await admin
        .from("documents")
        .delete()
        .eq("user_id", userId)
        .like("name", `${source.name}/%`);
    }

    const documentsToInsert: Array<Record<string, unknown>> = [];

    for (const { table_name } of tables) {
      const columns = await sql<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table_name}
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((c) => c.column_name);
      if (columnNames.length === 0) continue;

      const rows = await sql.unsafe(
        `SELECT * FROM "${table_name.replace(/"/g, '""')}" LIMIT ${MAX_ROWS_PER_TABLE}`
      ) as Record<string, unknown>[];

      const contentText = serializeTableRows(table_name, columnNames, rows);
      documentsToInsert.push({
        user_id: userId,
        name: `${source.name}/${table_name}`,
        file_type: "postgres-table",
        content_text: contentText,
        data_source_id: source.id,
        processed: true,
      });
    }

    if (documentsToInsert.length === 0) {
      throw new Error("No readable tables were found to sync.");
    }

    let insertedDocs: Array<{ id: string; name: string }> | null = null;
    const { data, error: insertError } = await admin
      .from("documents")
      .insert(documentsToInsert)
      .select("id, name");

    if (insertError) {
      // Fallback if data_source_id column migration has not been applied yet
      const fallbackDocs = documentsToInsert.map(doc => Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'data_source_id')));
      const { data: fallbackData, error: fallbackError } = await admin
        .from("documents")
        .insert(fallbackDocs)
        .select("id, name");

      if (fallbackError) throw fallbackError;
      insertedDocs = fallbackData;
    } else {
      insertedDocs = data;
    }

    await updateSyncStatus(source.id, "synced");

    // Auto-vectorize each synced document via process-document edge function
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    for (const doc of insertedDocs ?? []) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/process-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            document_id: doc.id,
            admin_mode: true,
            user_id: userId,
          }),
        });
      } catch (vecErr) {
        console.warn(`Failed to auto-vectorize "${doc.name}":`, vecErr);
      }
    }

    return {
      syncedTables: documentsToInsert.length,
      documents: insertedDocs ?? [],
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { action, dataSourceId } = await req.json();

    if (!dataSourceId) {
      return jsonResponse({ error: "dataSourceId is required" }, 400);
    }

    const source = await loadDataSource(dataSourceId, user.id);
    if (!source) {
      return jsonResponse({ error: "Data source not found" }, 404);
    }

    if (source.type !== "postgres") {
      return jsonResponse(
        { error: `Sync is not yet supported for type "${source.type}"` },
        400
      );
    }

    if (action === "test") {
      const result = await testPostgresConnection(source.connection_string!);
      await updateSyncStatus(source.id, "connected");
      return jsonResponse({ success: true, ...result });
    }

    if (action === "sync") {
      await updateSyncStatus(source.id, "syncing");
      try {
        const result = await syncPostgresToDocuments(source, user.id);
        return jsonResponse({ success: true, ...result });
      } catch (syncErr) {
        const message =
          syncErr instanceof Error ? syncErr.message : "Sync failed";
        await updateSyncStatus(source.id, "error", message);
        return jsonResponse({ error: message }, 500);
      }
    }

    return jsonResponse({ error: "Invalid action. Use 'test' or 'sync'." }, 400);
  } catch (error) {
    console.error("data-source function error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
