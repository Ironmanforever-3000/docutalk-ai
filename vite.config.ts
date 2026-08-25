import { defineConfig, loadEnv, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'http';

function getRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: unknown) => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', (err: Error) => {
      reject(err);
    });
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

function getPgClientOptions(connectionString: string) {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  return {
    connectionString,
    connectionTimeoutMillis: 10000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  };
}

async function testPostgresConnection(connectionString: string) {
  const { default: pg } = await import('pg');
  const client = new pg.Client(getPgClientOptions(connectionString));

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
      tables: tables.rows.map((t: { table_name: string }) => t.table_name),
      ping: result.rows[0]?.ok === 1,
    };
  } finally {
    await client.end();
  }
}

async function syncPostgresToDocuments(userSupabase: ReturnType<typeof import('@supabase/supabase-js')['createClient']>, source: Record<string, unknown>, userId: string) {
  if (!source.connection_string) {
    throw new Error('Connection string is missing for this data source.');
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client(getPgClientOptions(source.connection_string as string));

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

    await userSupabase
      .from('documents')
      .delete()
      .eq('data_source_id', source.id as string)
      .eq('user_id', userId);

    const documentsToInsert: Array<Record<string, unknown>> = [];

    for (const { table_name } of tables.rows) {
      const columns = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);

      const columnNames = columns.rows.map((c: { column_name: string }) => c.column_name);
      if (columnNames.length === 0) continue;

      const rows = await client.query(
        `SELECT * FROM "${table_name.replace(/"/g, '""')}" LIMIT 500`
      );

      const contentText = serializeTableRows(table_name, columnNames, rows.rows);
      documentsToInsert.push({
        user_id: userId,
        name: `${source.name as string}/${table_name}`,
        file_type: 'postgres-table',
        content_text: contentText,
        data_source_id: source.id as string,
        processed: true,
      });
    }

    if (documentsToInsert.length === 0) {
      throw new Error('No readable tables were found to sync.');
    }

    const { data, error: insertError } = await userSupabase
      .from('documents')
      .insert(documentsToInsert)
      .select('id, name');

    if (insertError) {
      // Fallback if data_source_id is not in database schema yet
      const fallbackDocs = documentsToInsert.map(doc => Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'data_source_id')));
      const { data: fallbackData, error: fallbackError } = await userSupabase
        .from('documents')
        .insert(fallbackDocs)
        .select('id, name');

      if (fallbackError) throw fallbackError;
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

function localDataSourcePlugin() {
  return {
    name: 'local-data-source-plugin',
    // This middleware is only for local Vite development.
    // Production builds on Vercel should use the real serverless endpoint at /api/data-source.
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url && req.url.startsWith('/api/data-source')) {
          res.setHeader('Content-Type', 'application/json');

          // CORS headers for local environment
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          try {
            const bodyText = await getRequestBody(req);
            const { action, dataSourceId } = JSON.parse(bodyText);

            if (!dataSourceId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'dataSourceId is required' }));
              return;
            }

            const authHeader = req.headers['authorization'];
            if (!authHeader) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }

            // Load supabase envs
            const env = loadEnv('', process.cwd(), 'VITE_');
            const supabaseUrl = env.VITE_SUPABASE_URL || '';
            const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

            // Create Supabase client using auth header context
            const { createClient } = await import('@supabase/supabase-js');
            const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
              global: { headers: { Authorization: authHeader } },
            });

            // Verify user
            const { data: { user }, error: authErr } = await userSupabase.auth.getUser();
            if (authErr || !user) {
              res.statusCode = 401;
              res.end(JSON.stringify({ error: 'Unauthorized: Invalid token' }));
              return;
            }

            // Retrieve data source connection details
            const { data: source, error: sourceErr } = await userSupabase
              .from('data_sources')
              .select('*')
              .eq('id', dataSourceId)
              .eq('user_id', user.id)
              .maybeSingle();

            if (sourceErr || !source) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Data source not found' }));
              return;
            }

            if (source.type !== 'postgres') {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: `Sync is not yet supported locally for type "${source.type}"` }));
              return;
            }

            if (action === 'test') {
              const result = await testPostgresConnection(source.connection_string as string);
              await userSupabase
                .from('data_sources')
                .update({
                  sync_status: 'connected',
                  sync_error: null,
                })
                .eq('id', dataSourceId);
              
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, ...result }));
              return;
            }

            if (action === 'sync') {
              // Update status to syncing
              await userSupabase
                .from('data_sources')
                .update({
                  sync_status: 'syncing',
                  sync_error: null,
                })
                .eq('id', dataSourceId);

              try {
                const result = await syncPostgresToDocuments(userSupabase, source, user.id);
                // Update status to synced
                await userSupabase
                  .from('data_sources')
                  .update({
                    sync_status: 'synced',
                    sync_error: null,
                    last_synced_at: new Date().toISOString(),
                  })
                  .eq('id', dataSourceId);

                // Auto-vectorize synced documents
                const docs = result?.documents ?? [];
                if (docs.length > 0) {
                  for (const doc of docs) {
                    userSupabase.functions.invoke('process-document', {
                      body: { document_id: doc.id },
                    }).catch((vecErr: unknown) => {
                      console.warn(`[Vectorize] Failed for "${doc.name}":`, vecErr);
                    });
                  }
                }

                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, ...result }));
              } catch (syncErr: unknown) {
                const message = syncErr instanceof Error ? syncErr.message : 'Sync failed';
                await userSupabase
                  .from('data_sources')
                  .update({
                    sync_status: 'error',
                    sync_error: message,
                  })
                  .eq('id', dataSourceId);

                res.statusCode = 500;
                res.end(JSON.stringify({ error: message }));
              }
              return;
            }

            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid action. Use 'test' or 'sync'." }));
          } catch (err: unknown) {
            console.error('Local API error:', err);
            const message = err instanceof Error ? err.message : 'Internal server error';
            res.statusCode = 500;
            res.end(JSON.stringify({ error: message }));
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localDataSourcePlugin()],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});

