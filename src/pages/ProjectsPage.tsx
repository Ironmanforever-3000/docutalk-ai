import { useState, useEffect } from 'react';
import { FolderKanban, Plus, Search, MoreVertical, Trash2, Edit, X, Check, Calendar, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Project } from '../types';

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [user]);

  const loadProjects = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, documents(count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!user || !newProjectName.trim()) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: newProjectName,
          description: newProjectDescription,
          user_id: user.id,
        })
        .select();

      if (error) throw error;

      if (data) {
        setProjects([...projects, data[0] as Project]);
        setShowCreateModal(false);
        setNewProjectName('');
        setNewProjectDescription('');
        setSuccess('Project created successfully');
        setTimeout(() => setSuccess(null), 3000);

        // Create notification
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Project Created',
          message: `Project "${newProjectName}" has been created successfully.`,
          type: 'success',
        });
      }
    } catch (err) {
      console.error('Error creating project:', err);
      setError('Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !newProjectName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: newProjectName,
          description: newProjectDescription,
        })
        .eq('id', editingProject.id);

      if (error) throw error;

      setProjects(
        projects.map((p) =>
          p.id === editingProject.id
            ? { ...p, name: newProjectName, description: newProjectDescription }
            : p
        )
      );

      setShowEditModal(false);
      setEditingProject(null);
      setNewProjectName('');
      setNewProjectDescription('');
      setSuccess('Project updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating project:', err);
      setError('Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete "${project.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (error) throw error;

      setProjects(projects.filter((p) => p.id !== project.id));
      setActiveMenu(null);
      setSuccess('Project deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting project:', err);
      setError('Failed to delete project');
    }
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setNewProjectName(project.name);
    setNewProjectDescription(project.description || '');
    setShowEditModal(true);
    setActiveMenu(null);
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative space-y-6">
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      {success && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {success}
        </div>
      )}

      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <X className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-parchment">Projects</h1>
          <p className="text-ash mt-1">Manage your RAG projects</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ash" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ember-500" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-ink-800 rounded-xl p-12 border border-ink-700 text-center">
          <FolderKanban className="w-16 h-16 text-ash/50 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-parchment mb-2">
            {searchTerm ? 'No projects found' : 'No projects yet'}
          </h3>
          <p className="text-ash mb-6">
            {searchTerm
              ? 'Try a different search term'
              : 'Create your first RAG project to get started'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors"
            >
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Link
              to={`/app/projects/${project.id}`}
              key={project.id}
              className="bg-ink-800 rounded-xl p-6 border border-ink-700 hover:border-ember-500/50 transition-colors group relative block"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-ember-500 to-ember-700 rounded-lg flex items-center justify-center">
                  <FolderKanban className="w-6 h-6 text-parchment" />
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActiveMenu(activeMenu === project.id ? null : project.id);
                    }}
                    className="p-1 text-ash hover:text-parchment opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {activeMenu === project.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveMenu(null);
                        }}
                      />
                      <div className="absolute right-0 mt-2 w-40 bg-ink-800 rounded-lg border border-ink-700 shadow-xl z-50 overflow-hidden">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openEditModal(project);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-parchment-300 hover:bg-ink-700 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteProject(project);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-red-400 hover:bg-ink-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-parchment mb-2">{project.name}</h3>
              {project.description && (
                <p className="text-ash text-sm mb-4 line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-ink-700 mt-auto">
                <div className="flex items-center gap-1 text-xs text-ash/60">
                  <Calendar className="w-3 h-3" />
                  {new Date(project.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1 text-xs text-ash/60">
                  <FileText className="w-3 h-3" />
                  {project.documents?.[0]?.count || 0} doc{project.documents?.[0]?.count !== 1 ? 's' : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-800 rounded-xl p-6 max-w-md w-full mx-4 border border-ink-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-parchment">Create New Project</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                className="text-ash hover:text-parchment"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                  placeholder="My RAG Project"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors resize-none"
                  rows={3}
                  placeholder="Project description..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                disabled={saving}
                className="flex-1 py-2 bg-ink-700 hover:bg-ink-600 text-parchment rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || saving}
                className="flex-1 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingProject && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-800 rounded-xl p-6 max-w-md w-full mx-4 border border-ink-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-parchment">Edit Project</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingProject(null);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                className="text-ash hover:text-parchment"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                  placeholder="My RAG Project"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors resize-none"
                  rows={3}
                  placeholder="Project description..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingProject(null);
                  setNewProjectName('');
                  setNewProjectDescription('');
                }}
                disabled={saving}
                className="flex-1 py-2 bg-ink-700 hover:bg-ink-600 text-parchment rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProject}
                disabled={!newProjectName.trim() || saving}
                className="flex-1 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
