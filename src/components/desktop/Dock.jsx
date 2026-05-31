import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { checkAdmin } from '../../api/admin';
import { Z } from '../../styles/tokens';


// macOS-style floating dock.
//
//   • Centered glass pill at the bottom, ~8px above the screen edge
//   • Squircle (rounded-[13px]) app icons with a soft drop-shadow
//   • Magnification: icons grow as the cursor approaches them, peaking
//     ~1.45× at center. Mouseleave releases the scale instantly.
//   • Running indicator: a small white pip (3px) below open apps, with
//     reserved space so the row doesn't shift when something opens.
//   • Tooltip with the app label floats above the hovered icon.
//
// The search button + clock that the Win11 taskbar carried have moved
// out - Spotlight has its own keyboard shortcut (⌘K) plus a magnifier
// in the menu bar, and the clock lives in the menu bar too. The dock
// only carries Launchpad → pinned apps → Settings → Widgets.

// Icon base sizes by dockSize preference. Magnification scales these
// up to MAGNIFY_MAX, so the actual pill height accommodates the peak.
const DOCK_SIZES = { small: 40, medium: 50, large: 60 };
const MAGNIFY_RADIUS = 120;
const MAGNIFY_MAX = 1.45;

function DockIcon({ app, mouseX, isOpen, isActive, onClick, size, iconStyle }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const iconRef = useRef(null);
  const Icon = app.icon;

  // Distance-based scale: peaks at 1× MAGNIFY_MAX when the cursor is at
  // the icon's center, eases to 1 at MAGNIFY_RADIUS, clamps to 1 beyond.
  let scale = 1;
  if (mouseX !== null && iconRef.current) {
    const r = iconRef.current.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const distance = Math.abs(mouseX - center);
    if (distance < MAGNIFY_RADIUS) {
      const t = 1 - distance / MAGNIFY_RADIUS;
      scale = 1 + (MAGNIFY_MAX - 1) * t;
    }
  }
  const iconSize = Math.max(18, Math.round(size * 0.62));

  return (
    <div className="relative flex flex-col items-center" ref={iconRef}>
      {tooltipVisible && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-[#1f1f1f]/95 text-white text-[11px] font-medium whitespace-nowrap pointer-events-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/[0.08]">
          {app.label}
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        data-tour={app.id === 'curricula' ? 'curricula-icon' : undefined}
        className="dock-icon flex items-center justify-center rounded-[13px] shadow-[0_4px_10px_rgba(0,0,0,0.25)] transition-transform duration-100 ease-out focus:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
        style={{
          width: size,
          height: size,
          transform: `scale(${scale})`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className={`w-full h-full rounded-[13px] flex items-center justify-center ${
            iconStyle === 'mono' ? 'bg-[#2a2a2e]' :
            iconStyle === 'glass' ? 'border border-white/20' :
            iconStyle === 'accent' ? '' :
            `bg-gradient-to-br ${app.gradient}`
          }`}
          style={
            iconStyle === 'glass'  ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' } :
            iconStyle === 'accent' ? { backgroundColor: `${app.color}22`, border: `1px solid ${app.color}44` } :
            undefined
          }
        >
          <Icon
            size={iconSize}
            className={iconStyle === 'accent' ? 'drop-shadow-sm' : 'text-white drop-shadow-sm'}
            style={iconStyle === 'accent' ? { color: app.color } : undefined}
          />
        </div>
      </button>
      {/* macOS running-app indicator. 3px white pip below the icon, with
          reserved row height so the layout doesn't shift on open/close.
          Active app gets a brighter, slightly larger pip. */}
      <div className="h-1.5 mt-1 flex items-center justify-center">
        {isOpen && (
          <span
            className={`rounded-full transition-all ${
              isActive
                ? 'w-[4px] h-[4px] bg-white'
                : 'w-[3px] h-[3px] bg-white/70'
            }`}
          />
        )}
      </div>
    </div>
  );
}

// + button in the dock tray - opens the Widgets app (a fixed-size
// window registered in AppWindow). The window spawns anchored above
// this button, centered horizontally on it, with an 18px gap so it
// looks like it's coming out of the +.
const WIDGETS_SIZE = { w: 420, h: 580 };
const WIDGETS_GAP = 18;
function SystemTrayIcons() {
  const { openApp } = useWindowManager();
  const btnRef = useRef(null);
  function handleClick() {
    const btn = btnRef.current;
    let position = null;
    if (btn) {
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      position = {
        x: Math.round(cx - WIDGETS_SIZE.w / 2),
        y: Math.round(r.top - WIDGETS_SIZE.h - WIDGETS_GAP),
      };
    }
    openApp('widgets', 'Widgets', { position, focusIfOpen: true });
  }
  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.07] active:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
      aria-label="Widgets"
    >
      <Plus size={12} strokeWidth={2.2} className="text-white/60" />
    </button>
  );
}

export default function Dock(_props) {
  const { state, openApp, restoreWindow, focusWindow } = useWindowManager();
  const { dockSize, iconStyle, theme } = useUIPreference();
  const dark = theme !== 'light';
  const size = DOCK_SIZES[dockSize] || 50;

  const [isAdmin, setIsAdmin] = useState(false);
  // Cursor x-position, tracked while the pointer is inside the dock.
  // Each DockIcon reads this on every render to compute its scale -
  // when null (mouse left the dock) every icon snaps back to base size.
  const [mouseX, setMouseX] = useState(null);
  const handleMouseMove = useCallback((e) => setMouseX(e.clientX), []);
  const handleMouseLeave = useCallback(() => setMouseX(null), []);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  const mainApps = APP_REGISTRY.filter(a => {
    if (['settings', 'newcurriculum'].includes(a.id)) return false;
    if (a.adminOnly && !isAdmin) return false;
    return true;
  });
  const utilApps = APP_REGISTRY.filter(a => a.id === 'settings');
  const openAppIds = new Set(Object.values(state.windows).map(w => w.appId));
  const activeAppId = state.activeWindowId ? state.windows[state.activeWindowId]?.appId : null;

  function handleIconClick(app) {
    const existing = Object.values(state.windows).find(w => w.appId === app.id);
    if (existing?.isMinimized) restoreWindow(existing.id);
    else if (existing) focusWindow(existing.id);
    else openApp(app.id, app.label, true);
  }

  return (
    <>
      {/* macOS-style floating dock. Centered glass pill, ~8px above the
          screen edge. Hugs its content (no flex-1 spacers) so the pill
          width tracks the icon count. Icons magnify on cursor proximity
          via mouseX - see DockIcon. The pill height fits the base icon
          + the indicator row; magnified icons grow upward and out of
          the pill, the way macOS does it. */}
      <div
        data-dock-theme={dark ? 'dark' : 'light'}
        className="fixed bottom-2 left-1/2 -translate-x-1/2 flex items-end px-3 pt-2 pb-1.5 gap-2 rounded-2xl transition-colors"
        style={{
          zIndex: Z.dock,
          background: dark ? 'rgba(28, 28, 34, 0.55)' : 'rgba(245, 245, 247, 0.55)',
          border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)',
          boxShadow: dark
            ? '0 12px 32px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.04) inset'
            : '0 12px 32px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(255,255,255,0.40) inset',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Pinned apps ── */}
        {mainApps.map(app => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            isOpen={openAppIds.has(app.id)}
            isActive={activeAppId === app.id}
            onClick={() => handleIconClick(app)}
            size={size}
            iconStyle={iconStyle}
          />
        ))}

        {/* ── Divider before utilities ── */}
        <div className="w-px bg-white/[0.12] self-center" style={{ height: size * 0.6 }} />

        {/* ── Settings ── */}
        {utilApps.map(app => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            isOpen={openAppIds.has(app.id)}
            isActive={activeAppId === app.id}
            onClick={() => handleIconClick(app)}
            size={size}
            iconStyle={iconStyle}
          />
        ))}

        {/* ── Widgets tray (+) ── */}
        <div className="w-px bg-white/[0.12] self-center" style={{ height: size * 0.6 }} />
        <div className="flex flex-col items-center">
          <SystemTrayIcons />
          <div className="h-1.5 mt-1" />
        </div>
      </div>
    </>
  );
}
