import { useState, useEffect } from 'react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import DesktopBackground from './DesktopBackground';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import APP_REGISTRY from './appRegistry';
import { Moon, Sun, Search, BookOpen, Settings, LogOut, Grid3x3 } from 'lucide-react';
import { checkAdmin } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';

// GNOME-style top bar
function TopPanel({ onActivities, onSettings, onLogout }) {
  const { theme, setTheme } = useUIPreference();
  const { user } = useAuth();
  const dark = theme === 'dark';
  const time = new Date();
  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="fixed top-0 left-0 right-0 h-7 z-[1000] flex items-center justify-between px-3"
      style={{ background: dark ? 'rgba(20,20,25,0.8)' : 'rgba(240,240,245,0.85)', backdropFilter: 'blur(20px)' }}>
      <button onClick={onActivities} className={`text-xs font-medium px-2 py-0.5 rounded ${dark ? 'text-white hover:bg-white/10' : 'text-gray-800 hover:bg-black/5'}`}>
        Activities
      </button>
      <span className={`text-xs font-medium ${dark ? 'text-white' : 'text-gray-800'}`}>{dateStr} {timeStr}</span>
      <div className="flex items-center gap-2">
        <button onClick={onSettings} className={`p-0.5 rounded ${dark ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`} title="Settings">
          <Settings size={12} />
        </button>
        <button onClick={() => setTheme(dark ? 'light' : 'dark')} className={`p-0.5 rounded ${dark ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`}>
          {dark ? <Sun size={12} /> : <Moon size={12} />}
        </button>
        <span className={`text-[11px] ${dark ? 'text-white/60' : 'text-gray-600'}`}>{user?.name?.split(' ')[0]}</span>
        <button onClick={onLogout} className={`p-0.5 rounded ${dark ? 'text-red-400/60 hover:text-red-400' : 'text-red-400 hover:text-red-500'}`} title="Log out">
          <LogOut size={12} />
        </button>
      </div>
    </div>
  );
}

// GNOME dash (left side dock) + "Show Apps" button at the bottom
function Dash({ openWindows, onOpenApp, onShowApps, onDashClick }) {
  const dark = document.documentElement.classList.contains('dark');
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  const apps = APP_REGISTRY.filter(a => !['newcurriculum'].includes(a.id) && (!a.adminOnly || isAdmin)).slice(0, 10);
  const openIds = new Set(openWindows.map(w => w.appId));

  return (
    <div className="fixed left-1 top-1/2 -translate-y-1/2 z-[1000] flex flex-col items-center gap-1 py-2 px-1 rounded-2xl"
      style={{ background: dark ? 'rgba(30,30,40,0.6)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(30px)', border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
      {apps.map(app => {
        const Icon = app.icon;
        return (
          <button key={app.id} onClick={() => onDashClick(app)} className="relative w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors" title={app.label}>
            <Icon size={20} style={{ color: app.color }} />
            {openIds.has(app.id) && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-full bg-blue-400" />}
          </button>
        );
      })}
      <div className="w-5 h-px bg-white/10 my-1" />
      {/* Show Applications — GNOME's dotted grid */}
      <button onClick={onShowApps} title="Show Applications (Ctrl+Shift+1)"
        className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
        <Grid3x3 size={20} style={{ color: dark ? '#fff' : '#333' }} />
      </button>
    </div>
  );
}

// GNOME "Show Applications" overlay — dim background + grid of every app
function AppsHub({ open, onClose, onOpenApp }) {
  const [query, setQuery] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);
  useEffect(() => { if (open) setQuery(''); }, [open]);

  // Global Esc handler (the autofocused input handles Esc too, but this
  // catches cases where focus moved elsewhere).
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const apps = APP_REGISTRY
    .filter(a => !['newcurriculum'].includes(a.id) && (!a.adminOnly || isAdmin))
    .filter(a => !query.trim() || a.label.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="appshub-overlay fixed inset-0 z-[1500] flex flex-col"
      style={{ background: 'rgba(20, 20, 28, 0.78)', backdropFilter: 'blur(40px) saturate(1.4)' }}
      onClick={onClose}
    >
      <div className="appshub-panel pt-20 px-6 flex justify-center" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          placeholder="Type to filter applications..."
          className="w-full max-w-md px-4 py-2.5 rounded-full bg-white/10 border border-white/15 text-white placeholder:text-white/40 text-sm outline-none focus:bg-white/15 focus:border-white/25"
        />
      </div>

      <div className="appshub-panel flex-1 overflow-y-auto flex items-start justify-center pt-10 pb-10" onClick={e => e.stopPropagation()}>
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-6 max-w-5xl px-8">
          {apps.map(app => {
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => { onOpenApp(app.id, app.label); onClose(); }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${app.gradient} flex items-center justify-center shadow-lg`}>
                  <Icon size={32} className="text-white" />
                </div>
                <span className="text-xs text-white/90 font-medium text-center max-w-[90px] truncate">{app.label}</span>
              </button>
            );
          })}
          {apps.length === 0 && (
            <div className="col-span-full text-center text-white/40 py-12 text-sm">No apps match "{query}"</div>
          )}
        </div>
      </div>

      <div className="appshub-panel pb-4 text-center text-[10px] text-white/40">
        <kbd className="font-mono border border-white/20 rounded px-1.5 py-0.5">esc</kbd> close
      </div>
    </div>
  );
}

export default function LinuxShell() {
  const { state, openApp, focusWindow, restoreWindow } = useWindowManager();
  const { logout } = useAuth();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [appsHubOpen, setAppsHubOpen] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      const cmdish = e.metaKey || e.ctrlKey;
      const isDigit1 = e.code === 'Digit1' || e.key === '1' || e.key === '!' || e.keyCode === 49;
      if (cmdish && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setSpotlightOpen(p => !p); }
      else if (cmdish && e.shiftKey && isDigit1) { e.preventDefault(); setAppsHubOpen(p => !p); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const windows = Object.values(state.windows);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <DesktopBackground />
      <TopPanel onActivities={() => setAppsHubOpen(true)} onSettings={() => openApp('settings', 'Settings')} onLogout={logout} />
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}
      <Dash
        openWindows={windows}
        onOpenApp={openApp}
        onShowApps={() => setAppsHubOpen(true)}
        onDashClick={(app) => {
          const existing = Object.values(state.windows).find(w => w.appId === app.id);
          if (existing?.isMinimized) restoreWindow(existing.id);
          else if (existing) focusWindow(existing.id);
          else openApp(app.id, app.label);
        }}
      />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
      <AppsHub open={appsHubOpen} onClose={() => setAppsHubOpen(false)} onOpenApp={openApp} />
    </div>
  );
}
