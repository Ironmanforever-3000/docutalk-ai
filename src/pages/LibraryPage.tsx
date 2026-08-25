import { useState, useEffect } from 'react';
import { Library, Search, Filter, Grid, List, FileText, FileImage, FileAudio, Video, MoreVertical, Download, Trash2, FileSpreadsheet, FileCode } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Document } from '../types';

export default function LibraryPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState('all');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const fileTypes = [
    { id: 'all', label: 'All Types', count: 0 },
    { id: 'pdf', label: 'PDF' },
    { id: 'doc', label: 'Documents' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
  ];

  useEffect(() => {
    loadDocuments();
  }, [user]);

  const loadDocuments = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.includes('image')) return FileImage;
    if (type.includes('audio')) return FileAudio;
    if (type.includes('video')) return Video;
    if (type.includes('spreadsheet') || type.includes('excel')) return FileSpreadsheet;
    if (type.includes('json') || type.includes('javascript') || type.includes('code')) return FileCode;
    return FileText;
  };

  const getFileColor = (type: string) => {
    if (type.includes('pdf')) return 'text-red-400 bg-red-500/10';
    if (type.includes('image')) return 'text-purple-400 bg-purple-500/10';
    if (type.includes('video')) return 'text-pink-400 bg-pink-500/10';
    if (type.includes('audio')) return 'text-cyan-400 bg-cyan-500/10';
    if (type.includes('spreadsheet') || type.includes('excel')) return 'text-green-400 bg-green-500/10';
    return 'text-ember-400 bg-ember-500/10';
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesFilter = true;
    if (filterType === 'pdf') matchesFilter = doc.file_type.includes('pdf');
    else if (filterType === 'doc') matchesFilter = doc.file_type.includes('document') || doc.file_type.includes('word');
    else if (filterType === 'image') matchesFilter = doc.file_type.includes('image');
    else if (filterType === 'video') matchesFilter = doc.file_type.includes('video');
    return matchesSearch && matchesFilter;
  });

  const handleDownload = async (doc: Document) => {
    if (!doc.storage_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading:', err);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm('Delete this document?')) return;

    try {
      if (doc.storage_path) {
        await supabase.storage.from('documents').remove([doc.storage_path]);
      }

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (error) throw error;

      setDocuments(documents.filter((d) => d.id !== doc.id));
      setActiveMenu(null);
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  return (
    <div className="relative space-y-6">
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      <div>
        <h1 className="font-display text-3xl font-semibold text-parchment">Library</h1>
        <p className="text-ash mt-1">Browse and manage your document collection</p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ash" />
          <input
            type="text"
            placeholder="Search library..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-ash" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment focus:outline-none focus:border-ember-500 transition-colors"
          >
            {fileTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex bg-ink-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'grid' ? 'bg-ember-600 text-parchment' : 'text-ash hover:text-parchment'
            }`}
          >
            <Grid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded transition-colors ${
              viewMode === 'list' ? 'bg-ember-600 text-parchment' : 'text-ash hover:text-parchment'
            }`}
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ember-500" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-ink-800 rounded-xl p-12 border border-ink-700 text-center">
          <Library className="w-16 h-16 text-ash/50 mx-auto mb-4" />
          <h3 className="font-display text-xl font-semibold text-parchment mb-2">
            {searchTerm ? 'No documents found' : 'Your library is empty'}
          </h3>
          <p className="text-ash">
            {searchTerm ? 'Try a different search term' : 'Upload files to start building your collection'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredDocs.map((doc) => {
            const Icon = getFileIcon(doc.file_type);
            const colorClass = getFileColor(doc.file_type);
            return (
              <div
                key={doc.id}
                className="bg-ink-800 rounded-lg p-4 border border-ink-700 hover:border-ink-700 transition-colors cursor-pointer group relative"
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setActiveMenu(activeMenu === doc.id ? null : doc.id)}
                    className="p-1 text-ash hover:text-parchment"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {activeMenu === doc.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                      <div className="absolute right-0 mt-1 w-32 bg-ink-800 rounded-lg border border-ink-700 shadow-xl z-50 overflow-hidden">
                        <button
                          onClick={() => { handleDownload(doc); setActiveMenu(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-parchment-300 hover:bg-ink-700"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                        <button
                          onClick={() => { handleDelete(doc); setActiveMenu(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-ink-700"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className={`aspect-square rounded-lg mb-3 flex items-center justify-center ${colorClass.split(' ')[1]}`}>
                  <Icon className={`w-12 h-12 ${colorClass.split(' ')[0]}`} />
                </div>
                <p className="text-parchment text-sm font-medium truncate">{doc.name}</p>
                <p className="text-ash/60 text-xs mt-1">
                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-ink-800 rounded-xl border border-ink-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="text-left py-3 px-6 text-ash font-medium text-sm">Name</th>
                <th className="text-left py-3 px-6 text-ash font-medium text-sm">Type</th>
                <th className="text-left py-3 px-6 text-ash font-medium text-sm">Added</th>
                <th className="text-right py-3 px-6 text-ash font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const Icon = getFileIcon(doc.file_type);
                return (
                  <tr
                    key={doc.id}
                    className="border-b border-ink-700 hover:bg-ink-800/50 transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-ash" />
                        <span className="text-parchment">{doc.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-ash text-sm">
                      {doc.file_type.split('/')[1] || doc.file_type}
                    </td>
                    <td className="py-4 px-6 text-ash text-sm">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Unknown'}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-2 text-ash hover:text-ember-400 transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          className="p-2 text-ash hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
