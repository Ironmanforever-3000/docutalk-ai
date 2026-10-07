import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// ─── Data Source Helpers ──────────────────────────────────────────────────────

export interface DataSourceActionResult {
  success?: boolean;
  error?: string;
  tableCount?: number;
  tables?: string[];
  syncedTables?: number;
  documents?: Array<{ id: string; name: string }>;
}

async function invokeDataSourceFunction(
  action: 'test' | 'sync',
  dataSourceId: string
): Promise<DataSourceActionResult> {
  const { data, error } = await supabase.functions.invoke('data-source', {
    body: { action, dataSourceId },
  });

  if (error) {
    throw new Error(
      error.message ||
        'Data source function unavailable. Deploy the data-source edge function to Supabase.'
    );
  }

  if (data?.error) {
    throw new Error(data.error as string);
  }

  return data as DataSourceActionResult;
}

/** Tests whether a saved PostgreSQL data source is reachable. */
export async function testDataSource(dataSourceId: string): Promise<DataSourceActionResult> {
  return invokeDataSourceFunction('test', dataSourceId);
}

/** Syncs PostgreSQL tables into documents so DocuTalk RAG can use them. */
export async function syncDataSource(dataSourceId: string): Promise<DataSourceActionResult> {
  return invokeDataSourceFunction('sync', dataSourceId);
}

// ─── General Chat (via Edge Function) ────────────────────────────────────────

/**
 * Calls the chat Edge Function for general Q&A without RAG context.
 */
export async function generalChat(
  message: string,
  history: Array<{ role: string; content: string }>,
  apiKey?: string,
  provider?: string
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session');
  }

  const { data, error } = await supabase.functions.invoke('chat', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      message,
      history,
      documents: [],
      apiKey: apiKey || '',
      provider: provider || 'openai',
    },
  });

  if (error) {
    throw new Error(error.message || 'Chat function unavailable');
  }

  return (data as { response: string }).response || 'No response generated.';
}

// ─── RAG Chat (via Edge Function) ────────────────────────────────────────────

export interface RagChatSource {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  content_snippet: string;
  similarity: number;
  x_coordinate: number | null;
  y_coordinate: number | null;
}

interface RagChatResult {
  response: string;
  sources: RagChatSource[];
  vectorSearch: boolean;
  query_coordinate?: { x: number; y: number; document_id: string } | null;
}

/**
 * Calls the rag-chat Edge Function for vector-powered retrieval.
 */
export async function ragChat(
  message: string,
  history: Array<{ role: string; content: string }>,
  documentIds: string[],
  apiKey?: string,
  provider?: string
): Promise<RagChatResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session');
  }

  const { data, error } = await supabase.functions.invoke('rag-chat', {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: {
      message,
      history,
      document_ids: documentIds,
      apiKey: apiKey || '',
      provider: provider || 'groq',
    },
  });

  if (error) {
    throw new Error(error.message || 'RAG chat function unavailable');
  }

  return data as RagChatResult;
}
