import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Project, Document } from '../types';
import { FolderKanban, MessageSquare, ArrowLeft, FileText, Calendar } from 'lucide-react';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && projectId) {
      loadProject();
    }
  }, [user, projectId]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId!)
        .eq('user_id', user!.id)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('id, name, file_type, created_at, status')
        .eq('project_id', projectId!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (docError) throw docError;
      setDocuments(docData || []);
    } catch (err) {
      console.error('Error loading project details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!project) return;
    try {
      // Create a new session pre-associated if needed, but for now we just pass state or query params.
      // Wait, we can navigate to chat with document IDs pre-selected.
      const docIds = documents.map(d => d.id).join(',');
      navigate(`/app/chat?project=${project.id}&docs=${docIds}`);
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ember-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h2 className="text-xl font-semibold text-parchment mb-2">Project Not Found</h2>
        <Link to="/app/projects" className="text-ember-400 hover:text-ember-500 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />

      <div>
        <Link to="/app/projects" className="inline-flex items-center gap-2 text-sm text-ash hover:text-parchment mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-ember-500 to-ember-700 rounded-xl flex items-center justify-center">
              <FolderKanban className="w-8 h-8 text-parchment" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold text-parchment">{project.name}</h1>
              {project.description && <p className="text-ash mt-1">{project.description}</p>}
            </div>
          </div>
          <button
            onClick={handleChat}
            disabled={documents.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-ember-600 hover:bg-ember-700 text-parchment rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MessageSquare className="w-5 h-5" />
            Chat with this project
          </button>
        </div>
      </div>

      <div className="bg-ink-800 border border-ink-700 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-ink-700 flex justify-between items-center bg-ink-900/50">
          <h2 className="text-lg font-semibold text-parchment flex items-center gap-2">
            <FileText className="w-5 h-5 text-ash" /> Project Documents
          </h2>
          <span className="text-xs font-medium px-2.5 py-1 bg-ink-800 border border-ink-700 rounded-full text-ash">
            {documents.length} Files
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-ash/30 mx-auto mb-3" />
            <p className="text-parchment font-medium mb-1">No documents yet</p>
            <p className="text-ash text-sm">Upload files and assign them to this project to see them here.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-700">
            {documents.map((doc) => (
              <div key={doc.id} className="p-4 hover:bg-ink-700/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-ink-900 rounded-lg flex items-center justify-center border border-ink-700">
                    <FileText className="w-5 h-5 text-ember-400" />
                  </div>
                  <div>
                    <h4 className="text-parchment font-medium text-sm">{doc.name}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-ash flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(doc.created_at!).toLocaleDateString()}
                      </span>
                      <span className={`text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full ${
                        doc.status === 'ready' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                        doc.status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {doc.status || 'processing'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
