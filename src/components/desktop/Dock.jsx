import { useState, useEffect } from 'react';
import { Wifi, ChevronUp, Search } from 'lucide-react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { checkAdmin } from '../../api/admin';
import { Z } from '../../styles/tokens';

// Windows 11 style taskbar.
//
// Structure (matches the Win11 default layout):
//   [ flex-1 spacer ] [ Search | pinned apps | sep | tray apps ] [ system tray + clock ]
//
// The left spacer + system-tray-on-the-right combine to keep the pinned
// icons centered as a group, exactly like Win11. The Search pill opens
// Spotlight (same launcher gesture as the menu-bar magnifier).
//
// The bar itself is a full-width mica strip pinned flush to the bottom
// edge — no floating pill, no margins. A thin top hairline + soft
// upward shadow give it physical separation from the wallpaper.
// Stays visible even when a window is maximized (Win11 taskbar behavior).

// Icon hit-area sizes by dockSize preference. All three fit inside the
// 48px taskbar with breathing room for the hover highlight.
const DOCK_SIZES = { small: 32, medium: 36, large: 40 };

function TaskbarIcon({ app, isOpen, isActive, onClick, size, iconStyle }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const Icon = app.icon;
  const innerSize = Math.max(20, Math.round(size * 0.62));
  const iconSize  = Math.max(14, Math.round(innerSize * 0.6));

  return (
    <div className="relative">
      {tooltipVisible && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded-sm bg-[#1f1f1f]/95 text-white text-[11px] font-normal whitespace-nowrap pointer-events-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.08]">
          {app.label}
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        data-tour={app.id === 'curricula' ? 'curricula-icon' : undefined}
        className="dock-icon relative flex items-center justify-center rounded-md transition-colors duration-100 ease-out hover:bg-white/[0.09] active:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/50"
        style={{ width: size, height: size }}
      >
        <div
          className={`flex items-center justify-center rounded-[6px] shadow-md ${
            iconStyle === 'mono' ? 'bg-[#2a2a2e]' :
            iconStyle === 'glass' ? 'border border-white/20' :
            iconStyle === 'accent' ? '' :
            `bg-gradient-to-br ${app.gradient}`
          }`}
          style={{
            width: innerSize, height: innerSize,
            ...(iconStyle === 'glass'  ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' } : {}),
            ...(iconStyle === 'accent' ? { backgroundColor: `${app.color}22`, border: `1px solid ${app.color}44` } : {}),
          }}
        >
          <Icon
            size={iconSize}
            className={iconStyle === 'accent' ? 'drop-shadow-sm' : 'text-white drop-shadow-sm'}
            style={iconStyle === 'accent' ? { color: app.color } : undefined}
          />
        </div>
        {/* Windows-style open indicator: thin pill bar pinned to the bottom
            edge. Inactive open app → short white bar. Active app → longer
            blue accent bar with a faint glow. */}
        {isOpen && (
          <span
            className={`absolute bottom-[2px] left-1/2 -translate-x-1/2 rounded-full transition-all duration-200 ${
              isActive
                ? 'w-[14px] h-[3px] bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.65)]'
                : 'w-[6px] h-[2px] bg-white/55'
            }`}
          />
        )}
      </button>
    </div>
  );
}

// Search button — opens Spotlight. Lives at the head of the taskbar
// cluster, same place Windows 11 puts its search pill. Slightly wider
// than a normal icon button because it carries both a magnifying glass
// and a hint label, mimicking the Win11 search affordance.
function SearchButton({ size, onClick }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const iconPx = Math.max(14, Math.round(size * 0.42));
  return (
    <div className="relative">
      {tooltipVisible && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded-sm bg-[#1f1f1f]/95 text-white text-[11px] font-normal whitespace-nowrap pointer-events-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.08]">
          Search
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        className="dock-icon relative flex items-center gap-1.5 px-2.5 rounded-md transition-colors duration-100 ease-out bg-white/[0.04] hover:bg-white/[0.10] active:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/50 text-white/85"
        style={{ height: size }}
        aria-label="Search"
      >
        <Search size={iconPx} strokeWidth={2.1} />
        <span className="text-[11.5px] font-normal hidden sm:inline">Search</span>
      </button>
    </div>
  );
}

// Right-side system tray. Just the hidden-icons chevron and a Wi-Fi
// glyph — battery and volume were removed since they're decorative-only
// (the web app can't actually control system audio/power) and were
// adding clutter. The chevron stays as a visual Windows cue.
function SystemTrayIcons() {
  return (
    <button
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors text-white/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/40"
      aria-label="System tray"
    >
      <ChevronUp size={12} strokeWidth={2.2} className="text-white/60" />
      <Wifi      size={14} strokeWidth={2}   />
    </button>
  );
}

// Live clock pinned to the bottom-right corner. Time on top, short date
// underneath — the standard Win11 stack. Updates every 15s, which is
// plenty for minute precision without firing constantly.
function SystemTrayClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: 'numeric' });
  return (
    <button
      className="flex flex-col items-end leading-[1.05] text-white/85 text-[11.5px] font-normal cursor-default select-none px-2.5 py-1.5 rounded-md hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/40"
      aria-label="Date and time"
    >
      <span>{time}</span>
      <span className="text-[10.5px] text-white/65 mt-[1px]">{date}</span>
    </button>
  );
}

export default function Dock({ onSpotlight }) {
  const { state, openApp, restoreWindow, focusWindow } = useWindowManager();
  const { dockSize, iconStyle } = useUIPreference();
  const size = DOCK_SIZES[dockSize] || 36;

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  // Social is a first-class dock app again — the menu-bar bell stays for
  // notifications/unread count, but Social also has its own icon so
  // users can open it directly without going through the bell.
  const mainApps = APP_REGISTRY.filter(a => !['settings', 'newcurriculum'].includes(a.id) && (!a.adminOnly || isAdmin));
  const utilApps = APP_REGISTRY.filter(a => ['settings'].includes(a.id));
  const openAppIds = new Set(Object.values(state.windows).map(w => w.appId));
  const activeAppId = state.activeWindowId ? state.windows[state.activeWindowId]?.appId : null;

  function handleIconClick(app) {
    const existing = Object.values(state.windows).find(w => w.appId === app.id);
    if (existing?.isMinimized) restoreWindow(existing.id);
    else if (existing) focusWindow(existing.id);
    else openApp(app.id, app.label, true);
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-12 flex items-center px-2 bg-[#1c1c1c]/85 border-t border-white/[0.06] shadow-[0_-2px_10px_rgba(0,0,0,0.30)]"
      style={{
        zIndex: Z.dock,
        backdropFilter: 'blur(30px) saturate(150%)',
        WebkitBackdropFilter: 'blur(30px) saturate(150%)',
      }}
    >
      {/* Left spacer balances the system tray on the right so the
          pinned-apps cluster ends up centered in the taskbar. */}
      <div className="flex-1" />

      {/* Centered cluster: Search pill + pinned apps + divider + Settings.
          Win11 keeps these as a single visual group. Search gets a touch
          of extra right-margin so it reads as a distinct affordance from
          the pinned-app run. */}
      <div className="flex items-center gap-0.5">
        <SearchButton size={size} onClick={() => onSpotlight?.()} />
        <span className="w-1" />
        {mainApps.map(app => (
          <TaskbarIcon
            key={app.id}
            app={app}
            isOpen={openAppIds.has(app.id)}
            isActive={activeAppId === app.id}
            onClick={() => handleIconClick(app)}
            size={size}
            iconStyle={iconStyle}
          />
        ))}
        <div className="w-px bg-white/[0.10] mx-1 self-center" style={{ height: size * 0.55 }} />
        {utilApps.map(app => (
          <TaskbarIcon
            key={app.id}
            app={app}
            isOpen={openAppIds.has(app.id)}
            isActive={activeAppId === app.id}
            onClick={() => handleIconClick(app)}
            size={size}
            iconStyle={iconStyle}
          />
        ))}
      </div>

      {/* Right side: system tray + clock. flex-1 + justify-end keeps it
          flush to the right edge regardless of how many apps are pinned. */}
      <div className="flex-1 flex justify-end items-center gap-1 pr-1">
        <SystemTrayIcons />
        <SystemTrayClock />
      </div>
    </div>
  );
}
