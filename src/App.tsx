import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UserProfileProvider } from './contexts/UserProfileContext';
import ErrorBoundary from './components/ErrorBoundary';
import Preloader from './components/Preloader';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import DataSourcesPage from './pages/DataSourcesPage';
import FilesPage from './pages/FilesPage';
import LibraryPage from './pages/LibraryPage';
import DocuTalkPage from './pages/DocuTalkPage';
import SettingsPage from './pages/SettingsPage';
import { supabase } from './lib/supabase';
import { Document } from './types';

type Page = 'Home' | 'Files' | 'Projects' | 'DataSources' | 'Library' | 'DocuTalk' | 'Settings';

function AppShell() {
  const { user, loading: authLoading } = useAuth();

  // Preloader state — shows on every cold load
  const [preloaderDone, setPreloaderDone] = useState(false);

  const [currentPage, setCurrentPage] = useState<Page>('Home');
  const [, setRecentFiles] = useState<Document[]>([]);

  useEffect(() => {
    if (!authLoading && user) {
      supabase
        .from('documents')
        .select('id, name, file_type')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
        .then(({ data }) => {
          if (data) setRecentFiles(data as unknown as Document[]);
        });
    }
  }, [user, authLoading]);

  // ── 1. Preloader (always first) ───────────────────────────────
  if (!preloaderDone) {
    return <Preloader onComplete={() => setPreloaderDone(true)} />;
  }

  // ── 2. Auth loading spinner ───────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-ember-500/30 border-t-ember-500 animate-spin" />
      </div>
    );
  }

  // ── 3. Auth page ──────────────────────────────────────────────
  if (!user) {
    return <AuthPage />;
  }

  // ── 5. Product app shell ──────────────────────────────────────
  return (
    <UserProfileProvider>
      <div className="min-h-screen bg-ink-950 flex text-parchment font-sans">
        <Sidebar currentPage={currentPage} onPageChange={(page: Page) => setCurrentPage(page)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header user={user} onNavigate={(page: Page) => setCurrentPage(page)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {currentPage === 'Home' && (
              <HomePage onNavigate={(page: Page) => setCurrentPage(page)} />
            )}
            {currentPage === 'Files' && <FilesPage />}
            {currentPage === 'Projects' && <ProjectsPage />}
            {currentPage === 'DataSources' && <DataSourcesPage />}
            {currentPage === 'Library' && <LibraryPage />}
            {currentPage === 'DocuTalk' && <DocuTalkPage />}
            {currentPage === 'Settings' && <SettingsPage />}
          </main>
        </div>
      </div>
    </UserProfileProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
