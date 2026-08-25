import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Trash2, Copy, Check, FileText, Settings, AlertCircle, Paperclip, X, Loader2, Mail, ExternalLink, Download, Inbox, Zap, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../contexts/UserProfileContext';
import { supabase, ragChat, generalChat, syncDataSource } from '../lib/supabase';
import { Document, ChatMessage, DataSource, Source } from '../types';
import { extractTextFromFile } from '../lib/extraction';
import { RetrievalVisualizer } from '../components/RetrievalVisualizer';
import { useDocumentChunkMap } from '../hooks/useDocumentChunkMap';

export default function DocuTalkPage() {
  const { user } = useAuth();
  const { profile } = useUserProfile();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Toast & Email Preview states
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    email: string;
    summary: string;
    fullSolution: string;
    prompt: string;
    emailEnabled: boolean;
  } | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [, setSessions] = useState<Array<{ id: string; title: string; created_at: string }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isSyncingSources, setIsSyncingSources] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  const [apiKey, setApiKey] = useState<string>('');
  const [provider, setProvider] = useState<string>('openai');
  const [showSettings, setShowSettings] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Custom Paste feature states
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [isSavingPaste, setIsSavingPaste] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // File-attach states
  const fileAttachRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Sources for each assistant message (message id → sources)
  const [messageSources, setMessageSources] = useState<Record<string, Source[]>>({});

  // Query PCA coordinates per message (message id → coordinate)
  const [queryCoordinates, setQueryCoordinates] = useState<
    Record<string, { x: number; y: number; document_id: string }>
  >({});

  // First selected document ID for the chunk map
  const mapDocId = selectedDocIds.size === 1 ? [...selectedDocIds][0] : null;
  const { nodes: chunkMapNodes } = useDocumentChunkMap(mapDocId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadSessions();
      initializeRagContext();
      loadApiKey();
    }
    // Functions are stable — they only read `user` from closure,
    // so they are intentionally omitted from deps to avoid re-triggering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  /**
   * Loads API key from localStorage first, then falls back to the correct
   * .env variable based on the saved provider.
   * Default provider is 'groq' (fast LLM) — embeddings always use OpenAI.
   */
  const loadApiKey = () => {
    const savedProvider = localStorage.getItem('docutalk_provider') || 'groq';
    const savedKey = localStorage.getItem('docutalk_api_key') || '';
    if (savedKey) setApiKey(savedKey);
    setProvider(savedProvider);
  };

  const saveApiKey = (key: string, prov: string) => {
    localStorage.setItem('docutalk_api_key', key);
    localStorage.setItem('docutalk_provider', prov);
    setApiKey(key);
    setProvider(prov);
    setTestResult(null);
    setShowSettings(false);
  };

  const resetToEnvDefaults = () => {
    localStorage.removeItem('docutalk_api_key');
    localStorage.removeItem('docutalk_provider');
    setApiKey('');
    setProvider('groq');
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const resolvedKey = apiKey;
      if (!resolvedKey) {
        setTestResult({ ok: false, message: `Enter an API key for ${provider} to test the connection.` });
        return;
      }

      const res = await fetch('/api/test-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, apiKey: resolvedKey }),
      });

      if (res.ok) {
        setTestResult({ ok: true, message: `Connected! ${provider} responded successfully.` });
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setTestResult({ ok: false, message: body?.error || `HTTP ${res.status} ${res.statusText}` });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const loadSessions = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        setSessions(data);
        setCurrentSessionId(data[0].id);
      } else {
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({ user_id: user.id, title: 'New Chat' })
          .select()
          .single();

        if (createError) throw createError;
        if (newSession) {
          setSessions([newSession]);
          setCurrentSessionId(newSession.id);
        }
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadMessages = async (sessionId: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const loadDocuments = async (): Promise<Document[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, file_type, content_text, extracted_text, status, char_count, error_message')
        .eq('user_id', user.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('Error fetching documents:', error);
      }

      const docs = (data as Document[]) || [];
      setSelectedDocIds(new Set(docs.map(d => d.id)));
      return docs;
    } catch (err) {
      console.error('Error loading documents:', err);
      return [];
    }
  };

  const loadDataSources = async () => {
    if (!user) return [];
    try {
      const { data } = await supabase
        .from('data_sources')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      return (data as DataSource[]) || [];
    } catch (err) {
      console.error('Error loading data sources:', err);
      return [];
    }
  };

  const initializeRagContext = async () => {
    if (!user) return;

    setIsSyncingSources(true);
    setIsLoadingDocs(true);
    setSyncNotice(null);

    try {
      const sources = await loadDataSources();
      setDataSources(sources);

      const postgresSources = sources.filter((s) => s.type === 'postgres');
      const needsSync = postgresSources.filter(
        (s) => s.sync_status !== 'synced' && s.sync_status !== 'syncing'
      );

      if (needsSync.length > 0) {
        setSyncNotice(`Syncing ${needsSync.length} data source(s) to DocuTalk AI...`);
        for (const source of needsSync) {
          try {
            await syncDataSource(source.id);
          } catch (syncErr) {
            console.warn(`Failed to sync data source ${source.name}:`, syncErr);
          }
        }
      }

      const loadedDocs = await loadDocuments();
      setDocuments(loadedDocs);

      const refreshedSources = await loadDataSources();
      setDataSources(refreshedSources);
    } catch (err) {
      console.error('Error initializing RAG context:', err);
      setSyncNotice('Could not sync data sources. Use Data Sources → Sync to DocuTalk AI.');
    } finally {
      setIsSyncingSources(false);
      setIsLoadingDocs(false);
      setTimeout(() => setSyncNotice(null), 5000);
    }
  };

  const handleFileAttach = useCallback(
    async (file: File) => {
      if (!user) return;
      setAttachError(null);
      setAttachedFileName(null);

      const ALLOWED = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/json',
        'application/xml',
        'text/xml',
      ];
      const isAllowed =
        ALLOWED.includes(file.type) ||
        file.name.endsWith('.md') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.docx') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.xml');

      if (!isAllowed) {
        const isImage = file.type.startsWith('image/');
        setAttachError(
          isImage
            ? `Image files are not supported (${file.name}). OCR is not available — paste or upload a text-based document instead.`
            : `Unsupported file type: ${file.name}`
        );
        return;
      }

      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        setAttachError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 50MB.`);
        return;
      }

      setIsParsingFile(true);
      try {
        const result = await extractTextFromFile(file);
        if (result.status === 'failed' || !result.text) {
          setAttachError(result.errorMessage || `Could not extract text from "${file.name}". The file may be image-only or corrupted.`);
          return;
        }
        const text = result.text;

        const { data, error } = await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            name: file.name,
            file_type: file.name.split('.').pop() || 'txt',
            status: 'ready',
            extracted_text: text,
            char_count: text.length,
            content_text: text,
            processed: true,
          })
          .select('id, name, file_type, content_text, extracted_text, status, char_count, error_message')
          .single();

        if (error) throw error;
        if (data) {
          setDocuments((prev) => [data as Document, ...prev]);
          setSelectedDocIds((prev) => new Set([...prev, data.id]));
          setAttachedFileName(file.name);
          // Trigger chunking + embedding so vector search finds this document
          const { error: vecError } = await supabase.functions.invoke('process-document', {
            body: { document_id: data.id },
          });
          if (vecError) {
            console.warn(`[Vectorize] Failed for attached doc "${file.name}":`, vecError);
          }
        }
      } catch (err) {
        console.error('handleFileAttach error:', err);
        setAttachError(err instanceof Error ? err.message : 'Failed to load file.');
      } finally {
        setIsParsingFile(false);
      }
    },
    [user]
  );

  const handleTextareaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      const file = files[0];
      // Only intercept if it's an actual file paste (not text with embedded images
      // from clipboard — e.g. copying from a webpage often includes image MIME types).
      // We check that the user intended a file paste by ensuring the clipboard
      // does NOT also contain plain text.
      const hasText = e.clipboardData.types?.includes('text/plain') ||
                      e.clipboardData.types?.includes('text/html');
      const isLikelyFilePaste = !hasText ||
                                file.size > 1024 * 1024 ||
                                file.type === 'application/pdf' ||
                                file.type.startsWith('text/');
      if (isLikelyFilePaste) {
        e.preventDefault();
        await handleFileAttach(files[0]);
      }
      // Otherwise let the normal text paste proceed
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await handleFileAttach(files[0]);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pastedText.trim()) return;

    setIsSavingPaste(true);
    setPasteError(null);
    const documentTitle = pasteTitle.trim() || `Pasted Doc - ${new Date().toLocaleDateString()}`;

    try {
      const trimmed = pastedText.trim();
      const { data, error } = await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            name: documentTitle,
            file_type: 'txt',
            status: 'ready',
            extracted_text: trimmed,
            char_count: trimmed.length,
            content_text: trimmed,
            processed: true,
          })
          .select('id, name, file_type, content_text, extracted_text, status, char_count, error_message')
          .single();

      if (error) throw error;
      if (data) {
        setDocuments((prev) => [data as Document, ...prev]);
        setSelectedDocIds((prev) => new Set([...prev, data.id]));
        setPastedText('');
        setPasteTitle('');
        setShowPasteArea(false);
        // Wait for chunking + embedding to finish before closing
        setIsSavingPaste(true);
        const { error: vecError } = await supabase.functions.invoke('process-document', {
          body: { document_id: data.id },
        });
        if (vecError) {
          console.warn(`[Vectorize] Failed for pasted doc "${documentTitle}":`, vecError);
        }
      }
    } catch (err) {
      console.error('Error saving pasted document:', err);
      setPasteError(err instanceof Error ? err.message : 'Failed to save document.');
    } finally {
      setIsSavingPaste(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const downloadSolutionFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerEmailWorkflow = async (userMessage: string, responseText: string) => {
    if (!user) return;

    const emailEnabled = profile?.email_notifications ?? true;
    
    // 1. Generate summary via chat edge function
    let summaryText = "Analyzing your documents to extract the best solution...";
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await supabase.functions.invoke('chat', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            message: `Review this user request and solution, then write a brief 2-3 sentence summary of what was solved for an email body. Do not use markdown or special formatting. Keep it plain text.

        User Request: "${userMessage}"
        Solution:
        ${responseText.slice(0, 1000)}`,
            history: [],
            documents: [],
            apiKey: apiKey || undefined,
            provider,
          },
        });
        if (res.data?.response) {
          summaryText = res.data.response.trim();
        }
      }
    } catch (err) {
      console.warn("Summary generation failed:", err);
      summaryText = `DocuTalk AI successfully analyzed your document context and generated a comprehensive solution for your request: "${userMessage.slice(0, 60)}...".`;
    }

    // 2. Insert DB notification
    try {
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'Solution Document Sent',
        message: `Your RAG analysis for "${userMessage.slice(0, 30)}..." is complete and emailed to ${user.email}.`,
        type: 'success',
      });
    } catch (err) {
      console.error("Error inserting notification:", err);
    }

    // 3. Set toast notification
    setToast({
      show: true,
      message: emailEnabled 
        ? `🚀 Analysis complete! We've dispatched your solution document to ${user.email}.`
        : `🚀 Analysis complete! Your solution document is compiled.`,
      email: user.email || '',
      summary: summaryText,
      fullSolution: responseText,
      prompt: userMessage,
      emailEnabled
    });

    // Auto-dismiss toast after 8 seconds
    setTimeout(() => {
      setToast(prev => {
        if (prev && prev.prompt === userMessage) {
          return { ...prev, show: false };
        }
        return prev;
      });
    }, 8000);
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !user || !currentSessionId) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    try {
      const { data: userData, error: userError } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          session_id: currentSessionId,
          role: 'user',
          content: userMessage,
        })
        .select()
        .single();

      if (userError) throw userError;
      if (userData) {
        setMessages((prev) => [...prev, userData as ChatMessage]);
      }

      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let responseText = '';
      let lastError = '';
      let currentSources: Source[] = [];
      let currentQueryCoordinate: { x: number; y: number; document_id: string } | null = null;

      const activeDocs = documents.filter((d) => selectedDocIds.has(d.id));

      try {
        if (activeDocs.length > 0) {
          const result = await ragChat(
            userMessage,
            history,
            activeDocs.map((d) => d.id),
            apiKey || undefined,
            provider
          );
          responseText = result.response;
          currentSources = result.sources;
          currentQueryCoordinate = result.query_coordinate ?? null;
        } else {
          responseText = await generalChat(
            userMessage,
            history,
            apiKey || undefined,
            provider
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn('Chat failed:', err);
      }

      if (!responseText) {
        responseText = `⚠️ **AI connection failed.**\n\nLast error: ${lastError}\n\nCheck your API key in ⚙️ Settings or verify your .env file.`;
      }

      const { data: aiData, error: aiError } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          session_id: currentSessionId,
          role: 'assistant',
          content: responseText,
        })
        .select()
        .single();

      if (aiError) throw aiError;
      if (aiData) {
        setMessages((prev) => [...prev, aiData as ChatMessage]);
        if (currentSources.length > 0) {
          setMessageSources((prev) => ({ ...prev, [aiData.id]: currentSources }));
        }
        if (currentQueryCoordinate) {
          setQueryCoordinates((prev) => ({ ...prev, [aiData.id]: currentQueryCoordinate }));
        }
      }
    } catch (err) {
      console.error('Error processing message thread:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = async () => {
    if (!user || !currentSessionId || !confirm('Clear this chat session?')) return;
    try {
      await supabase.from('chat_messages').delete().eq('session_id', currentSessionId);
      setMessages([]);
    } catch (err) {
      console.error('Error clearing chat:', err);
    }
  };

  return (
    <div className="relative h-[calc(100vh-8rem)] flex flex-col bg-ink-900 overflow-hidden">
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-ink-700 bg-ink-800">
        <div>
          <h1 className="font-display text-2xl font-semibold text-parchment">DocuTalk AI</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-ash">
              {isLoadingDocs
                ? 'Loading documents...'
                : selectedDocIds.size > 0
                ? `${selectedDocIds.size} of ${documents.length} document${documents.length !== 1 ? 's' : ''} active`
                : documents.length > 0
                ? '0 documents selected — answers will not use document context'
                : 'No documents loaded — upload, paste, or sync a data source.'}
            </p>
            {dataSources.filter((s) => s.sync_status === 'synced').length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-semibold rounded-full">
                <Database className="w-2.5 h-2.5" />
                {dataSources.filter((s) => s.sync_status === 'synced').length} DB source{dataSources.filter((s) => s.sync_status === 'synced').length > 1 ? 's' : ''}
              </span>
            )}
            {isSyncingSources && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-semibold rounded-full">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Syncing DB
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-ash hover:text-parchment hover:bg-ink-700 rounded-lg transition-colors"
            title="API Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-ash hover:text-red-400 hover:bg-ink-700 rounded-lg transition-colors"
              title="Clear Chat"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {syncNotice && (
        <div className="px-6 py-2 bg-ember-500/10 border-b border-ember-500/20 text-ember-400 text-xs">
          {syncNotice}
        </div>
      )}

      {/* Active Documents bar */}
      {documents.length > 0 && (
        <div className="px-6 py-2 bg-ink-800 border-b border-ink-700">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-ash/60 font-medium uppercase tracking-wider mr-1">Active Docs:</span>
            {documents.map((doc) => {
              const isSelected = selectedDocIds.has(doc.id);
              const displayName = doc.name.length > 30 ? doc.name.slice(0, 27) + '...' : doc.name;
              return (
                <button
                  key={doc.id}
                  onClick={() => {
                    const next = new Set(selectedDocIds);
                    if (isSelected) next.delete(doc.id); else next.add(doc.id);
                    setSelectedDocIds(next);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-ember-500/15 border-ember-500/40 text-ember-400'
                      : 'bg-ink-800 border-ink-700 text-ash/60 hover:text-parchment-300'
                  }`}
                >
                  {isSelected ? <Check className="w-2.5 h-2.5" /> : <div className="w-2.5 h-2.5" />}
                  {displayName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Chat messages area */}
      {loadingHistory ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ember-500" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
          <div className="text-center max-w-xl w-full space-y-6">
            <div className="bg-ink-800 border border-ink-700 rounded-2xl p-6 text-left">
              <h2 className="font-display text-base font-semibold text-parchment mb-3 flex items-center gap-2">
                <Bot className="w-5 h-5 text-ember-400" /> Intelligent Document Assistant
              </h2>
              <ul className="space-y-2 text-sm text-ash">
                <li>• Upload or paste knowledge resources to build your RAG context.</li>
                <li>• Ask context-aware questions grounded in your private documents.</li>
                <li>• For general questions, DocuTalk AI answers from its own knowledge.</li>
              </ul>
            </div>

            {/* Paste Segment UI */}
            <div>
              {!showPasteArea ? (
                <button
                  onClick={() => setShowPasteArea(true)}
                  className="px-5 py-2.5 bg-ink-800 hover:bg-ink-700 border border-ink-700 text-ember-400 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Or paste raw document text
                </button>
              ) : (
                <form
                  onSubmit={handlePasteSubmit}
                  className="text-left bg-ink-800 border border-ink-700 rounded-xl p-5 space-y-4 mx-auto"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-semibold text-parchment-300">Insert Text Node</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasteArea(false);
                        setPasteError(null);
                      }}
                      className="text-xs text-ash/60 hover:text-parchment-300"
                    >
                      Cancel
                    </button>
                  </div>

                  {pasteError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{pasteError}</span>
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="Document Title (e.g., Target System Blueprint)"
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-700 border border-ink-700 rounded-lg text-sm text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500"
                  />

                  <textarea
                    rows={4}
                    required
                    placeholder="Paste your source text data context here..."
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-700 border border-ink-700 rounded-lg text-sm text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 resize-none font-mono"
                  />

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingPaste || !pastedText.trim()}
                      className="px-4 py-2 bg-ember-600 hover:bg-ember-700 disabled:opacity-50 text-parchment text-xs font-semibold rounded-lg transition-colors"
                    >
                      {isSavingPaste ? 'Synchronizing...' : 'Load into Core Memory'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-9 h-9 bg-gradient-to-br from-ember-500 to-ember-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-parchment" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl p-4 ${
                  message.role === 'user'
                    ? 'bg-ember-600 text-parchment'
                    : 'bg-ink-800 border border-ink-700 text-parchment'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                {message.role === 'assistant' && messageSources[message.id]?.length > 0 && (
                  <RetrievalVisualizer
                    chunks={messageSources[message.id]}
                    allNodes={chunkMapNodes}
                    queryCoordinate={queryCoordinates[message.id]}
                  />
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-ash/60">
                  {message.role === 'assistant' && (
                    <>
                      <button
                        onClick={() => copyToClipboard(message.id, message.content)}
                        className="hover:text-ember-400 transition-colors"
                      >
                        {copiedId === message.id ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          const userMsg = messages
                            .slice(0, messages.indexOf(message))
                            .reverse()
                            .find((m) => m.role === 'user');
                          triggerEmailWorkflow(
                            userMsg?.content || message.content.slice(0, 60),
                            message.content
                          );
                        }}
                        className="hover:text-green-400 transition-colors inline-flex items-center gap-1"
                        title="Send solution to email"
                      >
                        <Mail className="w-3 h-3" />
                        Email
                      </button>
                    </>
                  )}
                </div>
              </div>
              {message.role === 'user' && (
                <div className="w-9 h-9 bg-ink-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-parchment" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-4">
              <div className="w-9 h-9 bg-gradient-to-br from-ember-500 to-ember-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-parchment" />
              </div>
              <div className="bg-ink-800 border border-ink-700 rounded-2xl p-4">
                <div className="flex gap-1.5 items-center h-5">
                  <div
                    className="w-1.5 h-1.5 bg-ink-700 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-ink-700 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-ink-700 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-ink-700 bg-ink-800">
        <div
          className={`max-w-5xl mx-auto transition-all duration-200 rounded-xl ${
            isDraggingOver ? 'ring-2 ring-ember-500 bg-ember-500/5' : ''
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
          {/* Attach status chips */}
          {(attachedFileName || attachError || isParsingFile) && (
            <div className="flex items-center gap-2 mb-2 px-1">
              {isParsingFile && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-ember-500/15 border border-ember-500/30 text-ember-400 text-xs rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Parsing file…
                </span>
              )}
              {attachedFileName && !isParsingFile && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/15 border border-green-500/30 text-green-400 text-xs rounded-full">
                  <Check className="w-3 h-3" />
                  {attachedFileName} loaded into RAG context
                  <button
                    onClick={() => setAttachedFileName(null)}
                    className="ml-1 hover:text-green-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {attachError && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/15 border border-red-500/30 text-red-400 text-xs rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  {attachError}
                  <button onClick={() => setAttachError(null)} className="ml-1 hover:text-red-200">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Drag hint */}
          {isDraggingOver && (
            <div className="absolute inset-x-4 pointer-events-none flex items-center justify-center gap-2 text-ember-400 text-sm font-medium py-1">
              <Paperclip className="w-4 h-4" /> Drop to load document into RAG context
            </div>
          )}

          <div className="flex gap-3 items-center">
            {/* Hidden file input */}
            <input
              ref={fileAttachRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileAttach(f);
                e.target.value = '';
              }}
            />

            {/* Attach button */}
            <button
              onClick={() => fileAttachRef.current?.click()}
              disabled={isParsingFile}
              title="Attach a document file (PDF, DOCX, TXT, MD, CSV…)"
              className="p-3 bg-ink-700 hover:bg-ink-700 border border-ink-700 text-ash hover:text-ember-400 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center flex-shrink-0"
            >
              {isParsingFile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              onPaste={handleTextareaPaste}
              placeholder={
                isDraggingOver
                  ? '📎 Drop your document here…'
                  : documents.length === 0
                  ? '⚠️ Load documents first — or attach a file with 📎'
                  : 'Ask questions about your documents… or paste / drop a file here'
              }
              rows={1}
              className="flex-1 px-4 py-3 bg-ink-700 border border-ink-700 rounded-xl text-sm text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors resize-none"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="p-3 bg-ember-600 hover:bg-ember-700 text-parchment rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[10px] text-ash/50 mt-1.5 px-1">
            📎 Click the clip icon, drag & drop, or paste (Ctrl+V) a file — PDF, DOCX, TXT, MD, CSV, JSON supported
          </p>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-ink-800 rounded-xl p-6 max-w-md w-full border border-ink-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-parchment">AI Engine Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-ash hover:text-parchment text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* RAG Architecture Info */}
              <div className="p-3 bg-gradient-to-r from-emerald-500/10 to-ember-500/10 border border-emerald-500/20 rounded-lg text-xs">
                <p className="font-semibold text-parchment mb-2 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  Hybrid RAG Architecture
                </p>
                <div className="space-y-1 text-ash">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span><span className="text-emerald-300 font-medium">Embeddings:</span> OpenAI text-embedding-3-small (always)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-ember-400 flex-shrink-0" />
                    <span><span className="text-ember-400 font-medium">Generation:</span> Provider selected below</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ash mb-2">
                  LLM GENERATION PROVIDER
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-ink-800 border border-ink-700 rounded-lg text-sm text-parchment focus:outline-none focus:border-ember-500"
                >
                  <option value="groq">⚡ Groq — Llama-3.1-8b-instant (Recommended — Fast)</option>
                  <option value="openai">OpenAI — GPT-4o-mini</option>
                  <option value="anthropic">Anthropic — Claude Sonnet 4.5</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ash mb-2">
                  GENERATION API KEY{' '}
                  <span className="text-ash/50 font-normal">
                    (optional; use a provider key only if you want to test the connection)
                  </span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'openai'
                      ? 'sk-...'
                      : provider === 'groq'
                      ? 'gsk_...'
                      : 'sk-ant-...'
                  }
                  className="w-full px-3 py-2 bg-ink-800 border border-ink-700 rounded-lg text-sm text-parchment placeholder-ash/50 focus:outline-none focus:border-ember-500 font-mono"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    testResult.ok
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/20 text-red-300'
                  }`}
                >
                  {testResult.ok ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  {testResult.message}
                </div>
              )}

              <div className="p-3 bg-ember-500/10 border border-ember-500/20 rounded-lg text-xs text-ember-400">
                💡 The generation provider handles both embedding and response. When the rag-chat edge function is deployed to Supabase, set <code>VOYAGE_API_KEY</code> or <code>OPENAI_API_KEY</code> as a Secret.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={testConnection}
                disabled={testing}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-parchment text-xs font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={resetToEnvDefaults}
                className="flex-1 py-2 bg-ink-800 hover:bg-ink-700 text-parchment-300 text-xs font-medium rounded-lg transition-colors"
              >
                Clear local API key
              </button>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-2 bg-ink-800 hover:bg-ink-700 text-parchment-300 text-xs font-medium rounded-lg transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => saveApiKey(apiKey, provider)}
                className="flex-1 py-2 bg-ember-600 hover:bg-ember-700 text-parchment text-xs font-medium rounded-lg transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
      {/* RAG-to-Email Toast Notification */}
      {toast && toast.show && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-ink-800/95 border border-ink-700 rounded-xl shadow-2xl p-4 backdrop-blur-md animate-slide-in flex items-start gap-3 text-left">
          <div className="p-2 bg-ember-500/10 rounded-lg text-ember-400">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm font-semibold text-parchment">RAG Analysis Completed</p>
            <p className="text-xs text-ash mt-1">{toast.message}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  setShowEmailModal(true);
                  setToast(prev => prev ? { ...prev, show: false } : null);
                }}
                className="px-3 py-1.5 bg-ember-600 hover:bg-ember-700 text-parchment text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1"
              >
                <Inbox className="w-3.5 h-3.5" /> Preview Email
              </button>
              <button
                onClick={() => downloadSolutionFile(`DocuTalk_Solution_${Date.now()}.md`, toast.fullSolution)}
                className="px-3 py-1.5 bg-ink-700 hover:bg-ink-700 text-parchment-300 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 border border-ink-700"
              >
                <Download className="w-3.5 h-3.5" /> Download Doc
              </button>
            </div>
          </div>
          <button
            onClick={() => setToast(prev => prev ? { ...prev, show: false } : null)}
            className="text-ash/60 hover:text-parchment-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Email Inbox Preview Modal */}
      {showEmailModal && toast && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-ink-800 rounded-xl max-w-2xl w-full border border-ink-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-left">
            <div className="flex items-center justify-between p-4 border-b border-ink-700 bg-ink-800/50">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-ember-400" />
                <h2 className="text-sm font-semibold text-parchment">Dispatched Email Preview</h2>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="text-ash hover:text-parchment"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Headers */}
            <div className="p-4 bg-ink-800/30 border-b border-ink-700 text-xs space-y-2 text-ash">
              <div>
                <span className="font-semibold text-ash/60 mr-2">FROM:</span>
                <span className="text-parchment-300">DocuTalk RAG Service &lt;no-reply@docutalk.ai&gt;</span>
              </div>
              <div>
                <span className="font-semibold text-ash/60 mr-2">TO:</span>
                <span className="text-ember-400">{toast.email}</span>
              </div>
              <div>
                <span className="font-semibold text-ash/60 mr-2">SUBJECT:</span>
                <span className="text-parchment font-medium">📝 DocuTalk Solution: {toast.prompt.slice(0, 45)}...</span>
              </div>
              <div>
                <span className="font-semibold text-ash/60 mr-2">STATUS:</span>
                <span className="text-green-400 font-semibold flex items-center gap-1 inline-flex">
                  <Check className="w-3.5 h-3.5" /> Dispatched successfully (Email Toggle ON)
                </span>
              </div>
            </div>

            {/* Simulated Email Body */}
            <div className="flex-1 overflow-y-auto p-8 bg-[#f9fafb] text-gray-800">
              <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 bg-gradient-to-r from-ember-600 to-ember-700 text-parchment">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                      <Inbox className="w-5 h-5 text-parchment" />
                    </div>
                    <span className="font-bold text-lg tracking-tight">DocuTalk AI</span>
                  </div>
                  <p className="text-xs text-ember-500">Intelligent RAG Document Solution</p>
                </div>

                <div className="p-6 space-y-6 text-sm leading-relaxed">
                  <div>
                    <p className="font-semibold text-gray-900 text-base text-left">Hello,</p>
                    <p className="text-ash/50 mt-2 text-left">
                      Our RAG-based AI model has finished analyzing your private knowledge sources and compiled a solution context for your request.
                    </p>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg border-l-4 border-ember-500 text-gray-700 text-left">
                    <p className="text-xs font-bold text-ash/60 uppercase tracking-wider">Solution Summary</p>
                    <p className="mt-1 font-medium italic text-gray-900">"{toast.summary}"</p>
                  </div>

                  <div className="text-center pt-2">
                    <a
                      href="http://localhost:5173/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-ember-600 hover:bg-ember-700 text-parchment text-xs font-semibold rounded-lg shadow-md transition-all hover:scale-[1.02]"
                    >
                      View & Refine on DocuTalk <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Attachment Section */}
                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-ash/60 mb-2 text-left">ATTACHMENTS (1)</p>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-red-500" />
                        <div className="text-left">
                          <p className="text-xs font-semibold text-gray-900 font-sans">DocuTalk_Solution.md</p>
                          <p className="text-[10px] text-ash/60">Markdown Document · 24 KB</p>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadSolutionFile(`DocuTalk_Solution_${Date.now()}.md`, toast.fullSolution)}
                        className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-ash/50 hover:text-ember-700 rounded-md transition-colors flex items-center justify-center"
                        title="Download Attachment"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 text-center text-[10px] text-ash">
                  This is an automated delivery sent by DocuTalk AI based on your in-app preferences.
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 border-t border-ink-700 bg-ink-800/50 flex justify-between items-center text-xs">
              <span className="text-ash/60">
                💡 Sent using transactional email settings. Configure keys in settings to deploy.
              </span>
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 bg-ink-700 hover:bg-ink-700 text-parchment font-semibold rounded-lg transition-colors border border-ink-700"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}