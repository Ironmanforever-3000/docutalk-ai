import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type AnySupabaseClient = SupabaseClient;

function jsonResponse(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function getRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: unknown) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', (err: Error) => reject(err));
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function serializeTableRows(tableName: string, columns: string[], rows: Record<string, unknown>[]): string {
  const header = `Table: ${tableName}\nColumns: ${columns.join(', ')}\nTotal rows synced: ${rows.length}\n\n`;
  if (rows.length === 0) {
    return `${header}(empty table)\n`;
  }

  const body = rows
    .map((row, index) => {
      const fields = columns
        .map((col) => `${col}=${formatValue(row[col])}`)
        .join(', ');
      return `Row ${index + 1}: ${fields}`;
    })
    .join('\n');

  return `${header}${body}\n`;
}

async function getAuthenticatedUser(token: string | null) {
  if (!token) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

async function loadDataSource(admin: AnySupabaseClient, dataSourceId: string, userId: string) {
  const { data, error } = await admin
    .from('data_sources')
    .select('id, name, type, connection_string, user_id')
    .eq('id', dataSourceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as { id: string; name: string; type: string; connection_string: string | null; user_id: string };
}

async function testPostgresConnection(connectionString: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    ssl:
      connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const result = await client.query('SELECT 1 as ok');
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT 50
    `);

    return {
      ok: true,
      tableCount: tables.rows.length,
      tables: tables.rows.map((row: { table_name: string }) => row.table_name),
      ping: result.rows[0]?.ok === 1,
    };
  } finally {
    await client.end();
  }
}

async function syncPostgresToDocuments(admin: AnySupabaseClient, source: { id: string; name: string; type: string; connection_string: string | null }, userId: string) {
  if (!source.connection_string) {
    throw new Error('Connection string is missing for this data source.');
  }

  const client = new Client({
    connectionString: source.connection_string,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
    ssl:
      source.connection_string.includes('localhost') || source.connection_string.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT 50
    `);

    if (tables.rows.length === 0) {
      throw new Error('No public tables found in the connected database.');
    }

    const documentsToInsert: Array<Record<string, unknown>> = [];

    for (const { table_name } of tables.rows) {
      const columns = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table_name]
      );

      const columnNames = columns.rows.map((row: { column_name: string }) => row.column_name);
      if (columnNames.length === 0) continue;

      const rows = await client.query(`SELECT * FROM "${table_name.replace(/"/g, '""')}" LIMIT 500`);
      const contentText = serializeTableRows(table_name, columnNames, rows.rows);

      documentsToInsert.push({
        user_id: userId,
        name: `${source.name}/${table_name}`,
        file_type: 'postgres-table',
        content_text: contentText,
        data_source_id: source.id,
        processed: true,
      });
    }

    if (documentsToInsert.length === 0) {
      throw new Error('No readable tables were found to sync.');
    }

    const { data, error } = await admin
      .from('documents')
      .insert(documentsToInsert)
      .select('id, name');

    if (error) {
      const fallbackDocs = documentsToInsert.map((doc) =>
        Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'data_source_id'))
      );
      const { data: fallbackData, error: fallbackError } = await admin
        .from('documents')
        .insert(fallbackDocs)
        .select('id, name');

      if (fallbackError) {
        throw fallbackError;
      }

      return {
        syncedTables: documentsToInsert.length,
        documents: fallbackData || [],
      };
    }

    return {
      syncedTables: documentsToInsert.length,
      documents: data || [],
    };
  } finally {
    await client.end();
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, { error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(res, { error: 'Server configuration missing Supabase environment variables' }, 500);
  }

  let bodyText: string;
  try {
    bodyText = await getRequestBody(req);
  } catch {
    return jsonResponse(res, { error: 'Unable to read request body' }, 400);
  }

  let body: { action?: string; dataSourceId?: string };
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse(res, { error: 'Request body must be valid JSON' }, 400);
  }

  const { action, dataSourceId } = body;
  if (!action || !dataSourceId) {
    return jsonResponse(res, { error: 'action and dataSourceId are required' }, 400);
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
  const user = await getAuthenticatedUser(token);

  if (!user) {
    return jsonResponse(res, { error: 'Unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const source = await loadDataSource(admin, dataSourceId, user.id);

  if (!source) {
    return jsonResponse(res, { error: 'Data source not found' }, 404);
  }

  if (source.type !== 'postgres') {
    return jsonResponse(res, { error: `Sync is only supported for postgres data sources. Received type: ${source.type}` }, 400);
  }

  try {
    if (action === 'test') {
      const result = await testPostgresConnection(source.connection_string as string);
      await admin
        .from('data_sources')
        .update({ sync_status: 'connected', sync_error: null })
        .eq('id', source.id);
      return jsonResponse(res, { success: true, ...result });
    }

    if (action === 'sync') {
      await admin
        .from('data_sources')
        .update({ sync_status: 'syncing', sync_error: null })
        .eq('id', source.id);

      const result = await syncPostgresToDocuments(admin, source, user.id);
      await admin
        .from('data_sources')
        .update({ sync_status: 'synced', sync_error: null, last_synced_at: new Date().toISOString() })
        .eq('id', source.id);

      return jsonResponse(res, { success: true, ...result });
    }

    return jsonResponse(res, { error: "Invalid action. Use 'test' or 'sync'." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    await admin
      .from('data_sources')
      .update({ sync_status: 'error', sync_error: message })
      .eq('id', source.id);
    return jsonResponse(res, { error: message }, 500);
  }
}
