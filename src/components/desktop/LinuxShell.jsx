import { useState, useEffect } from 'react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import DesktopBackground from './DesktopBackground';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import APP_REGISTRY from './appRegistry';
import { Moon, Sun, Search, BookOpen, Settings, LogOut } from 'lucide-react';
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

// GNOME dash (left side dock)
function Dash({ openWindows, onOpenApp }) {
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
          <button key={app.id} onClick={() => onOpenApp(app.id, app.label)} className="relative w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors" title={app.label}>
            <Icon size={20} style={{ color: app.color }} />
            {openIds.has(app.id) && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-full bg-blue-400" />}
          </button>
        );
      })}
    </div>
  );
}

export default function LinuxShell() {
  const { state, openApp, focusWindow } = useWindowManager();
  const { logout } = useAuth();
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSpotlightOpen(p => !p); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const windows = Object.values(state.windows);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <DesktopBackground />
      <TopPanel onActivities={() => setSpotlightOpen(true)} onSettings={() => openApp('settings', 'Settings')} onLogout={logout} />
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}
      <Dash openWindows={windows} onOpenApp={openApp} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}
