import {
  Home,
  Files,
  FolderKanban,
  Database,
  Library,
  MessageSquare,
  Settings,
  LogOut,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const menuItems = [
  { path: '/app', icon: Home, label: 'Home', end: true },
  { path: '/app/files', icon: Files, label: 'Files' },
  { path: '/app/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/app/data-sources', icon: Database, label: 'Data Sources' },
  { path: '/app/chat', icon: MessageSquare, label: 'DocuTalk AI' },
];

export default function Sidebar() {
  const { signOut } = useAuth();

  return (
    <aside className="w-64 bg-ink-900 border-r border-ink-700 flex flex-col">
      <div className="p-6 border-b border-ink-700">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h1 className="font-display text-xl font-semibold text-parchment">DocuTalk</h1>
            <p className="text-xs text-ash">AI RAGbot Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-ember-600 text-parchment'
                  : 'text-ash hover:bg-ink-800 hover:text-parchment'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-ink-700">
        <NavLink
          to="/app/settings"
          className={({ isActive }) => `w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            isActive
              ? 'bg-ember-600 text-parchment'
              : 'text-ash hover:bg-ink-800 hover:text-parchment'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </NavLink>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-ash hover:bg-ink-800 hover:text-parchment mt-2 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}