import { useEffect, useRef, useState } from 'react';
import { Wifi, Battery, Search, Sparkles, Bluetooth, MoonStar, Moon, Sun, LogOut } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { useAuth } from '../../context/AuthContext';
import { useUIShell } from '../../context/UIShellContext';
import { getApp } from './appRegistry';
import { WALLPAPERS } from './DesktopBackground';
import { Z } from '../../styles/tokens';

// macOS-style menu bar, ported from EngOS.
//
//   [RushilAI mark + dropdown] [active app] [Help]   …   [AI ★] [Control Center] [Spotlight] [date + time]
//
// Glass surface (28px h-7) at the very top. The logo dropdown opens an
// Apple-style menu with About / Sleep / Restart / Shut Down (all wired
// through UIShellContext). The Control Center pop-out swaps Wi-Fi /
// Bluetooth / Do Not Disturb / Appearance / Battery / Dock Size /
// Wallpaper picker — replaces the Settings-app dance for those toggles.

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

// Faux battery — the web app can't actually read system power, so we
// surface a wandering 60-100% value just to round out the chrome.
function useFakeBattery() {
  const [pct, setPct] = useState(87);
  useEffect(() => {
    const t = window.setInterval(() => {
      setPct((p) => Math.max(60, Math.min(100, p + (Math.random() < 0.5 ? -1 : 1))));
    }, 12_000);
    return () => window.clearInterval(t);
  }, []);
  return pct;
}

// Stylized brand mark — a gear-meets-apple SVG with a cyan-purple-pink
// gradient. Replaces the EngOS gear since this is RushilAI now.
function RushilAIMark({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="rushilai-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <g transform="translate(50 50)">
        {[...Array(8)].map((_, i) => (
          <rect
            key={i}
            x={-5}
            y={-44}
            width={10}
            height={14}
            rx={2}
            transform={`rotate(${i * 45})`}
            fill="url(#rushilai-mark-grad)"
          />
        ))}
        <circle r={26} fill="url(#rushilai-mark-grad)" />
        <circle r={10} fill="#0b1020" />
      </g>
    </svg>
  );
}

export default function MenuBar({ onSpotlight }) {
  const { state } = useWindowManager();
  const { user, logout } = useAuth();
  const { setPower, setBooted } = useUIShell();
  const now = useNow();
  const batt = useFakeBattery();
  const [logoOpen, setLogoOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const logoRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (logoOpen && logoRef.current && !logoRef.current.contains(e.target)) setLogoOpen(false);
      if (userOpen && userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [logoOpen, userOpen]);

  const activeWin = state.activeWindowId ? state.windows[state.activeWindowId] : null;
  const activeApp = activeWin ? getApp(activeWin.appId) : null;
  const activeName = activeApp ? activeApp.label : 'Desktop';

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div
      data-menubar
      className="fixed top-0 left-0 right-0 h-7 flex items-center px-3 text-[13px] text-white/90 chrome glass glass-edge"
      style={{ zIndex: Z.menubar, background: 'rgba(0,0,0,0.40)' }}
    >
      {/* Left section */}
      <div className="flex items-center gap-3">
        <div ref={logoRef} className="relative">
          <button
            onClick={() => setLogoOpen((o) => !o)}
            className="flex items-center px-1 rounded hover:bg-white/15"
            aria-label="RushilAI menu"
          >
            <RushilAIMark size={16} />
          </button>
          {logoOpen && (
            <div className="absolute top-full left-0 mt-1 glass-strong glass-edge rounded-lg py-1 min-w-[200px] shadow-window" style={{ boxShadow: 'var(--shadow-window)' }}>
              <MenuItem label="About RushilAI" onClick={() => { setLogoOpen(false); window.alert('RushilAI — built for learners. v1.0.0'); }} />
              <MenuSep />
              <MenuItem label="Sleep" onClick={() => { setLogoOpen(false); setPower('sleep'); }} />
              <MenuItem label="Restart" onClick={() => { setLogoOpen(false); setBooted(false); window.setTimeout(() => setBooted(true), 50); }} />
              <MenuItem label="Shut Down…" onClick={() => { setLogoOpen(false); setPower('off'); }} />
            </div>
          )}
        </div>
        <div className="font-semibold">{activeName}</div>
        <button
          onClick={onSpotlight}
          className="opacity-70 hover:opacity-100 hover:bg-white/15 rounded px-1.5 hidden sm:block transition-opacity"
          title="Open Spotlight (⌘K)"
        >
          Help
        </button>
      </div>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-2.5">
        <button
          title="Ask RushilAI (⌘K)"
          onClick={onSpotlight}
          className="flex items-center gap-1 hover:bg-white/15 rounded px-1 transition-colors"
        >
          <Sparkles size={14} className="text-pink-300" />
        </button>
        <ControlCenterButton batt={batt} />
        <button
          onClick={onSpotlight}
          className="hover:bg-white/15 rounded px-1 transition-colors"
          title="Spotlight (⌘K)"
        >
          <Search size={14} />
        </button>
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen((o) => !o)}
            className="hover:bg-white/15 rounded px-1.5 transition-colors text-[12.5px] text-white/85"
          >
            {user?.name?.split(' ')[0] || 'User'}
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-1 glass-strong glass-edge rounded-lg py-1 min-w-[200px] shadow-window">
              <div className="px-3 py-1.5 border-b border-white/10">
                <p className="text-xs font-medium text-white">{user?.name || 'User'}</p>
                <p className="text-[10px] text-white/50">{user?.email}</p>
              </div>
              <button
                onClick={() => { setUserOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 transition-colors"
              >
                <LogOut size={12} /> Log Out
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="opacity-90">{date}</span>
          <span className="font-medium">{time}</span>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1 hover:bg-white/10 text-sm"
    >
      {label}
    </button>
  );
}
function MenuSep() { return <div className="my-1 h-px bg-white/10" />; }

function ControlCenterButton({ batt }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (open && ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Control Center"
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-white/15 transition-colors"
      >
        <Wifi size={13} className="opacity-95" />
        <Battery size={15} className="opacity-95" />
        <span className="text-[11px] tabular-nums opacity-90">{batt}%</span>
      </button>
      {open && <ControlCenter batt={batt} />}
    </div>
  );
}

function ControlCenter({ batt }) {
  const { dockSize, setDockSize, theme, setTheme, wallpaper, setWallpaper } = useUIPreference();
  const [wifiOn, setWifiOn] = useState(true);
  const [btOn, setBtOn] = useState(true);
  const [dnd, setDnd] = useState(false);
  // EngOS exposed a continuous dock-size slider (56-110). RushilAI keeps the
  // small/medium/large preference, so the slider snaps to three steps.
  const dockSizeIdx = ['small', 'medium', 'large'].indexOf(dockSize);
  const dockSizeVal = dockSizeIdx < 0 ? 1 : dockSizeIdx;
  // Restrict the wallpaper grid in Control Center to the curated EngOS set
  // plus Conway. The full catalog is still available via Settings.
  const wpGrid = ['engaurora', 'engsunset', 'engoceanic', 'engforest', 'engcosmic', 'conway'];
  return (
    <div
      className="absolute right-0 top-full mt-1.5 w-[320px] glass-strong rounded-2xl p-3 border border-white/10"
      style={{ zIndex: Z.menubarMenu, boxShadow: 'var(--shadow-window)', background: 'rgba(28,28,36,0.85)' }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Tile active={wifiOn} onClick={() => setWifiOn((v) => !v)} icon={<Wifi size={15} />}      title="Wi-Fi"      subtitle={wifiOn ? 'RushilAI Lab' : 'Off'} />
        <Tile active={btOn}   onClick={() => setBtOn((v) => !v)}   icon={<Bluetooth size={15} />} title="Bluetooth"  subtitle={btOn ? 'On' : 'Off'} />
        <Tile active={dnd}    onClick={() => setDnd((v) => !v)}    icon={<MoonStar size={15} />}  title="Focus"      subtitle={dnd ? 'Do Not Disturb' : 'Off'} />
        <Tile active={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} icon={theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />} title="Appearance" subtitle={theme === 'dark' ? 'Dark' : 'Light'} />
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-2.5 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-white/65">
          <Battery size={13} />
          <span>Battery</span>
          <span className="ml-auto font-mono">{batt}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${batt}%` }} />
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-2.5">
        <div className="text-[11px] text-white/65 mb-1.5">Dock Size</div>
        <input
          type="range" min={0} max={2} step={1}
          value={dockSizeVal}
          onChange={(e) => setDockSize(['small', 'medium', 'large'][parseInt(e.target.value, 10)] || 'medium')}
          className="w-full"
        />
      </div>

      <div className="mt-3 rounded-xl bg-white/5 p-2.5">
        <div className="text-[11px] text-white/65 mb-1.5">Wallpaper</div>
        <div className="grid grid-cols-6 gap-1.5">
          {wpGrid.map((id) => {
            const wp = WALLPAPERS[id];
            if (!wp) return null;
            const bg = wp.type === 'gradient'
              ? { backgroundImage: wp.css, backgroundSize: 'cover' }
              : wp.type === 'live'
                ? { background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }
                : wp.url
                  ? { backgroundImage: `url(${wp.url}&w=120&q=40)`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : {};
            return (
              <button
                key={id}
                onClick={() => setWallpaper(id)}
                className={`h-9 rounded-md border transition-colors ${wallpaper === id ? 'border-white' : 'border-white/15 hover:border-white/40'}`}
                style={bg}
                title={wp.label}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({ active, onClick, icon, title, subtitle }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
        active ? 'bg-sky-500/30 hover:bg-sky-500/40' : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center ${
          active ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/85'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-white truncate">{title}</div>
        <div className="text-[10px] text-white/55 truncate">{subtitle}</div>
      </div>
    </button>
  );
}
