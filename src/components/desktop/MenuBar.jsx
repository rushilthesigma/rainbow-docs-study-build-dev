import { useState, useEffect, useRef } from 'react';
import { BookOpen, Moon, Sun, Search, LogOut, ChevronDown, Bell, Users, MessageCircle } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { getApp } from './appRegistry';
import { useAuth } from '../../context/AuthContext';
import { listDMs, getFriendRequests } from '../../api/social';
import SocialPanel from './SocialPanel';

// macOS-style menu bar.
//
// Layout:
//   [logo · RushilAI · | · ActiveApp]                     [widgets] [user] [date+time]
//
// Right-side widgets (replaces the old split-view icon, which read like
// a 2nd magnifying glass in the toolbar — the user called it "the 2x
// search thing" and asked for it gone):
//
//   • Search         — opens Spotlight (Cmd+K)
//   • Notifications  — Social bell + unread DM/friend-request badge.
//                      Clicking opens the Social app via the window
//                      manager. Counter polls every 30s.
//   • Theme toggle   — sun / moon
//
// Center widget: a small "weather"-style status pill is intentionally
// omitted (no weather data wired); we surface the date + time as the
// macOS clock widget on the far right instead.
export default function MenuBar({ onSpotlight }) {
  const { state } = useWindowManager();
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [time, setTime] = useState(new Date());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Social widget — unread count = open DM threads with new messages
  // since `lastReadAt` + pending friend requests. Polled, not pushed,
  // since Social already polls its own state every 3s when open.
  const [socialUnread, setSocialUnread] = useState(0);
  // Social menu-bar dropdown — toggled by the bell. There is no
  // separate Social app window; clicking the bell again closes it.
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialAnchor, setSocialAnchor] = useState(null);
  const bellRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Refresh the Social unread badge every 60s. Cheap fetch — both
  // endpoints already exist for the Social app.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const [dmRes, frRes] = await Promise.allSettled([listDMs(), getFriendRequests()]);
        if (cancelled) return;
        const dms = dmRes.status === 'fulfilled' ? (dmRes.value?.conversations || []) : [];
        const reqs = frRes.status === 'fulfilled' ? (frRes.value?.requests || []) : [];
        // A conversation contributes to "unread" if it has any incoming
        // message after the user's `lastReadAt`. The /api/social/dm
        // payload doesn't always carry that, so we approximate with
        // server-supplied `unread` flag if present, otherwise count
        // friend requests only.
        const unreadDms = dms.filter((c) => c?.unread).length;
        setSocialUnread(unreadDms + reqs.length);
      } catch {/* soft fail */}
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('covalent-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem('covalent-theme');
    if (saved === 'dark') setDark(true);
    else if (saved === 'light') setDark(false);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setDark(true);
  }, []);

  // Close user menu on click outside
  useEffect(() => {
    if (!showUserMenu) return;
    function onClick(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setShowUserMenu(false); }
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [showUserMenu]);

  const activeWin = state.activeWindowId ? state.windows[state.activeWindowId] : null;
  const activeApp = activeWin ? getApp(activeWin.appId) : null;

  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Toggle the menu-bar Social dropdown. Captures the bell's current
  // bounding rect so the panel can anchor itself directly below it.
  function toggleSocial() {
    if (socialOpen) { setSocialOpen(false); return; }
    if (bellRef.current) setSocialAnchor(bellRef.current.getBoundingClientRect());
    setSocialOpen(true);
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 h-7 flex items-center justify-between px-4 z-[1100] select-none text-[13px]"
      style={{
        background: dark ? 'rgba(20, 20, 30, 0.65)' : 'rgba(240, 240, 245, 0.7)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        borderBottom: dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <BookOpen size={14} className={dark ? 'text-white/90' : 'text-gray-800'} />
          <span className={`font-semibold ${dark ? 'text-white/90' : 'text-gray-800'}`}>RushilAI</span>
        </div>
        {activeApp && (
          <>
            <span className={dark ? 'text-white/30' : 'text-gray-300'}>|</span>
            <span className={`font-medium ${dark ? 'text-white/70' : 'text-gray-600'}`}>{activeApp.label}</span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSpotlight}
          className={`p-1 rounded ${dark ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800'} transition-colors`}
          title="Spotlight (Cmd+K)"
        >
          <Search size={13} />
        </button>

        {/* Social — menu-bar dropdown. Click toggles the panel; it
            doesn't expand into a separate window. */}
        <button
          ref={bellRef}
          onClick={toggleSocial}
          className={`relative p-1 rounded ${dark ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800'} ${socialOpen ? (dark ? 'bg-white/10 text-white/90' : 'bg-black/10 text-gray-900') : ''} transition-colors`}
          title={socialUnread > 0 ? `Social — ${socialUnread} unread` : 'Social'}
        >
          <MessageCircle size={13} />
          {socialUnread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-[14px] text-center tabular-nums"
              style={{ boxShadow: '0 0 0 1.5px ' + (dark ? 'rgba(20,20,30,0.95)' : 'rgba(240,240,245,0.95)') }}
            >
              {socialUnread > 9 ? '9+' : socialUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => setDark(!dark)}
          className={`p-1 rounded ${dark ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800'} transition-colors`}
          title={dark ? 'Switch to light' : 'Switch to dark'}
        >
          {dark ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`flex items-center gap-1 px-1 rounded ${dark ? 'text-white/60 hover:text-white/90' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
          >
            <span>{user?.name?.split(' ')[0] || 'User'}</span>
            <ChevronDown size={10} />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 top-7 w-48 rounded-lg shadow-xl overflow-hidden z-[1200]"
              style={{
                background: dark ? 'rgba(30, 30, 40, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(30px)',
                border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              }}
            >
              <div className={`px-3 py-2 border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}>
                <p className={`text-xs font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>{user?.name || 'User'}</p>
                <p className={`text-[10px] ${dark ? 'text-white/50' : 'text-gray-400'}`}>{user?.email}</p>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); logout(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${dark ? 'text-red-400 hover:bg-white/5' : 'text-red-500 hover:bg-gray-50'} transition-colors`}
              >
                <LogOut size={12} /> Log Out
              </button>
            </div>
          )}
        </div>

        <span className={`tabular-nums ${dark ? 'text-white/70' : 'text-gray-600'}`}>{dateStr} {timeStr}</span>
      </div>

      <SocialPanel
        open={socialOpen}
        onClose={() => setSocialOpen(false)}
        anchorRect={socialAnchor}
      />
    </div>
  );
}
