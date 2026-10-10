import { useState, useEffect } from 'react';
import { Database, Plus, Search, MoreVertical, Trash2, Edit, X, Check, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, testDataSource, syncDataSource } from '../lib/supabase';
import { DataSource } from '../types';

export default function DataSourcesPage() {
  const { user } = useAuth();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState('postgres');
  const [newSourceConnection, setNewSourceConnection] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const dataTypes = [
    { id: 'postgres', label: 'PostgreSQL', icon: '🐘', color: 'blue' },
  ];

  useEffect(() => {
    loadDataSources();
  }, [user]);

  const loadDataSources = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDataSources(data || []);
    } catch (err) {
      console.error('Error loading data sources:', err);
      setError('Failed to load data sources');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDataSource = async () => {
    if (!user || !newSourceName.trim()) return;

    setSaving(true);
    const sourceName = newSourceName.trim();
    const sourceType = newSourceType;
    try {
      const { data, error } = await supabase
        .from('data_sources')
        .insert({
          name: sourceName,
          type: sourceType,
          connection_string: newSourceConnection,
          user_id: user.id,
        })
        .select();

      if (error) throw error;

      if (data) {
        setDataSources([...dataSources, data[0] as DataSource]);
        setShowCreateModal(false);
        resetForm();

        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Data Source Connected',
          message: `Data source "${sourceName}" has been added successfully.`,
          type: 'success',
        });

        if (sourceType === 'postgres') {
          try {
            setSuccess('Syncing data source to DocuTalk AI...');
            const syncResult = await syncDataSource(data[0].id);
            setSuccess(
              `Synced ${syncResult.syncedTables ?? 0} table(s) from "${sourceName}" to DocuTalk AI`
            );
            await loadDataSources();
          } catch (syncErr) {
            setSuccess(null);
            setError(
              syncErr instanceof Error
                ? syncErr.message
                : 'Saved, but sync failed. Use Sync to DocuTalk AI from the card menu.'
            );
          }
        } else {
          setSuccess(`Data source "${sourceName}" connected successfully. Use Sync to DocuTalk AI to ingest data.`);
        }
        setTimeout(() => setSuccess(null), 4000);
      }
    } catch (err) {
      console.error('Error creating data source:', err);
      setError('Failed to connect data source');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDataSource = async () => {
    if (!editingSource || !newSourceName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('data_sources')
        .update({
          name: newSourceName,
          type: newSourceType,
          connection_string: newSourceConnection,
        })
        .eq('id', editingSource.id);

      if (error) throw error;

      setDataSources(
        dataSources.map((ds) =>
          ds.id === editingSource.id
            ? { ...ds, name: newSourceName, type: newSourceType, connection_string: newSourceConnection }
            : ds
        )
      );

      setShowEditModal(false);
      setEditingSource(null);
      resetForm();
      setSuccess('Data source updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating data source:', err);
      setError('Failed to update data source');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDataSource = async (source: DataSource) => {
    if (!confirm(`Are you sure you want to delete "${source.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', source.id);

      if (error) throw error;

      setDataSources(dataSources.filter((ds) => ds.id !== source.id));
      setActiveMenu(null);
      setSuccess('Data source removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting data source:', err);
      setError('Failed to delete data source');
    }
  };

  const handleTestConnection = async (source: DataSource) => {
    setTestingId(source.id);
    setError(null);
    try {
      const result = await testDataSource(source.id);
      setSuccess(
        `Connected to ${source.name} — found ${result.tableCount ?? 0} table(s)${
          result.tables?.length ? `: ${result.tables.slice(0, 5).join(', ')}` : ''
        }`
      );
      await loadDataSources();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTestingId(null);
      setActiveMenu(null);
    }
  };

  const handleSyncToDocuTalk = async (source: DataSource) => {
    setSyncingId(source.id);
    setError(null);
    try {
      const result = await syncDataSource(source.id);
      setSuccess(
        `Synced ${result.syncedTables ?? 0} table(s) from "${source.name}" to DocuTalk AI`
      );
      await loadDataSources();
      setTimeout(() => setSuccess(null), 4000);

      await supabase.from('notifications').insert({
        user_id: user!.id,
        title: 'Database Synced to DocuTalk',
        message: `${result.syncedTables ?? 0} tables from "${source.name}" are now available in DocuTalk AI.`,
        type: 'success',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingId(null);
      setActiveMenu(null);
    }
  };

  const openEditModal = (source: DataSource) => {
    setEditingSource(source);
    setNewSourceName(source.name);
    setNewSourceType(source.type);
    setNewSourceConnection(source.connection_string || '');
    setShowEditModal(true);
    setActiveMenu(null);
  };

  const resetForm = () => {
    setNewSourceName('');
    setNewSourceType('postgres');
    setNewSourceConnection('');
  };

  const filteredDataSources = dataSources.filter((source) =>
    source.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDataSourceIcon = (type: string) => dataTypes.find(t => t.id === type)?.icon || '📁';

  return (
    <div className="relative space-y-6">
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      {success && !error && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-parchment px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {success}
        </div>
      )}

      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-parchment px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-parchment">Data Sources</h1>
          <p className="text-ash mt-1">Connect external databases and APIs</p>
        </div>
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  setError(null);
                  setSuccess(null);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Source
              </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ash" />
          <input
            type="text"
            placeholder="Search data sources..."
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
      ) : filteredDataSources.length === 0 ? (
        <div className="bg-ink-800 rounded-xl p-12 border border-ink-700 text-center">
          <Database className="w-16 h-16 text-ash/50 mx-auto mb-4" />
          <h3 className="font-display text-xl font-semibold text-parchment mb-2">
            {searchTerm ? 'No data sources found' : 'No data sources connected'}
          </h3>
          <p className="text-ash mb-6">
            {searchTerm
              ? 'Try a different search term'
              : 'Connect your first data source to start ingesting data'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors"
            >
              Add Data Source
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDataSources.map((source) => (
            <div
              key={source.id}
              className="bg-ink-800 rounded-xl p-6 border border-ink-700 hover:border-ink-700 transition-colors group relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-2xl">
                  {getDataSourceIcon(source.type)}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setActiveMenu(activeMenu === source.id ? null : source.id)}
                    className="p-1 text-ash hover:text-parchment opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {activeMenu === source.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setActiveMenu(null)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-ink-800 rounded-lg border border-ink-700 shadow-xl z-50 overflow-hidden">
                        <button
                          onClick={() => handleTestConnection(source)}
                          disabled={testingId === source.id || syncingId === source.id}
                          className="w-full flex items-center gap-2 px-4 py-3 text-parchment-300 hover:bg-ink-700 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${testingId === source.id ? 'animate-spin' : ''}`} />
                          {testingId === source.id ? 'Testing...' : 'Test Connection'}
                        </button>
                        <button
                          onClick={() => handleSyncToDocuTalk(source)}
                          disabled={testingId === source.id || syncingId === source.id}
                          className="w-full flex items-center gap-2 px-4 py-3 text-ember-400 hover:bg-ink-700 transition-colors disabled:opacity-50"
                        >
                          <ExternalLink className={`w-4 h-4 ${syncingId === source.id ? 'animate-pulse' : ''}`} />
                          {syncingId === source.id ? 'Syncing...' : 'Sync to DocuTalk AI'}
                        </button>
                        <button
                          onClick={() => openEditModal(source)}
                          className="w-full flex items-center gap-2 px-4 py-3 text-parchment-300 hover:bg-ink-700 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteDataSource(source)}
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

              <h3 className="font-display text-lg font-semibold text-parchment mb-2">{source.name}</h3>
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-1 bg-ink-800 rounded text-xs text-parchment-300 uppercase">
                  {source.type}
                </span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    source.sync_status === 'synced'
                      ? 'text-green-400'
                      : source.sync_status === 'error'
                      ? 'text-red-400'
                      : source.sync_status === 'syncing'
                      ? 'text-yellow-400'
                      : 'text-ash'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      source.sync_status === 'synced'
                        ? 'bg-green-400'
                        : source.sync_status === 'error'
                        ? 'bg-red-400'
                        : source.sync_status === 'syncing'
                        ? 'bg-yellow-400 animate-pulse'
                        : 'bg-ink-700'
                    }`}
                  />
                  {source.sync_status === 'synced'
                    ? 'Synced to DocuTalk'
                    : source.sync_status === 'error'
                    ? 'Sync failed'
                    : source.sync_status === 'syncing'
                    ? 'Syncing...'
                    : source.sync_status === 'connected'
                    ? 'Connected'
                    : 'Not synced'}
                </span>
              </div>

              {source.last_synced_at && (
                <p className="text-xs text-ash/60 mb-3">
                  Last synced {new Date(source.last_synced_at).toLocaleString()}
                </p>
              )}

              {source.sync_error && (
                <p className="text-xs text-red-400 mb-3">{source.sync_error}</p>
              )}

              <button
                onClick={() => handleSyncToDocuTalk(source)}
                disabled={syncingId === source.id || testingId === source.id}
                className="w-full mb-4 py-2 bg-ember-600/20 hover:bg-ember-600/30 border border-ember-500/30 text-ember-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {syncingId === source.id ? 'Syncing to DocuTalk AI...' : 'Sync to DocuTalk AI'}
              </button>

              <div className="pt-4 border-t border-ink-700">
                <span className="text-xs text-ash/60">
                  Added {new Date(source.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-800 rounded-xl p-6 max-w-md w-full mx-4 border border-ink-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-parchment">Add Data Source</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-ash hover:text-parchment"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Source Name *
                </label>
                <input
                  type="text"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                  placeholder="Production Database"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {dataTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setNewSourceType(type.id)}
                      className={`px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                        newSourceType === type.id
                          ? 'bg-ember-600 border-ember-600 text-parchment'
                          : 'bg-ink-800 border-ink-700 text-parchment-300 hover:border-ash/60'
                      }`}
                    >
                      <span>{type.icon}</span>
                      <span className="text-sm">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Connection String
                </label>
                <input
                  type="text"
                  value={newSourceConnection}
                  onChange={(e) => setNewSourceConnection(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                  placeholder="postgresql://user:password@host:port/database"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                disabled={saving}
                className="flex-1 py-2 bg-ink-700 hover:bg-ash/20 text-parchment rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDataSource}
                disabled={!newSourceName.trim() || saving}
                className="flex-1 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingSource && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-800 rounded-xl p-6 max-w-md w-full mx-4 border border-ink-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-parchment">Edit Data Source</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingSource(null);
                  resetForm();
                }}
                className="text-ash hover:text-parchment"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Source Name *
                </label>
                <input
                  type="text"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {dataTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setNewSourceType(type.id)}
                      className={`px-3 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                        newSourceType === type.id
                          ? 'bg-ember-600 border-ember-600 text-parchment'
                          : 'bg-ink-800 border-ink-700 text-parchment-300 hover:border-ash/60'
                      }`}
                    >
                      <span>{type.icon}</span>
                      <span className="text-sm">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-parchment-300 mb-2">
                  Connection String
                </label>
                <input
                  type="text"
                  value={newSourceConnection}
                  onChange={(e) => setNewSourceConnection(e.target.value)}
                  className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingSource(null);
                  resetForm();
                }}
                disabled={saving}
                className="flex-1 py-2 bg-ink-700 hover:bg-ash/20 text-parchment rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateDataSource}
                disabled={!newSourceName.trim() || saving}
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
