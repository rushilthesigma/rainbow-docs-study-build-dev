import { useState, useEffect, useRef, useCallback } from 'react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { checkAdmin } from '../../api/admin';
import Modal from '../shared/Modal';
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
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-neutral-200/95 dark:bg-[#1f1f1f]/95 text-gray-900 dark:text-white text-[11px] font-medium whitespace-nowrap pointer-events-none z-10 shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-black/[0.08] dark:border-white/[0.08]">
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
            iconStyle === 'mono' ? 'bg-neutral-100 dark:bg-[#2a2a2e]' :
            iconStyle === 'glass' ? 'border border-white/20' :
            iconStyle === 'accent' ? '' :
            `bg-gradient-to-br ${app.gradient}`
          }`}
          style={
            iconStyle === 'glass'  ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', willChange: 'transform', transform: 'translateZ(0)' } :
            iconStyle === 'accent' ? { backgroundColor: `${app.color}22`, border: `1px solid ${app.color}44` } :
            undefined
          }
        >
          <Icon
            size={iconSize}
            className={
              iconStyle === 'accent' ? 'drop-shadow-sm' :
              iconStyle === 'mono' ? 'text-gray-900 dark:text-white drop-shadow-sm' :
              'text-white drop-shadow-sm'
            }
            style={iconStyle === 'accent' ? { color: app.color } : undefined}
          />
        </div>
      </button>
      {/* macOS running-app indicator. Fixed 4px white pip below the icon, with
          reserved row height so the layout doesn't shift on open/close.
          Active app gets full opacity + full scale; inactive gets 0.7 opacity
          + 0.75 scale (≈3px). Both transitions are compositor-only (opacity +
          transform) so the Dock's backdrop-filter is never re-rasterized on
          focus changes, preventing the one-frame wallpaper flash. */}
      <div className="h-1.5 mt-1 flex items-center justify-center">
        {isOpen && (
          <span
            className="rounded-full bg-gray-700 dark:bg-white block"
            style={{
              width: 4, height: 4,
              opacity: isActive ? 1 : 0.7,
              transform: `scale(${isActive ? 1 : 0.75}) translateZ(0)`,
              transition: 'opacity 0.15s, transform 0.15s',
              willChange: 'transform, opacity',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function Dock(_props) {
  const { state, openApp } = useWindowManager();
  const { dockSize, iconStyle, theme } = useUIPreference();
  const dark = theme !== 'light';
  const size = DOCK_SIZES[dockSize] || 50;

  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingApp, setPendingApp] = useState(null);
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
    const alreadyOpen = Object.values(state.windows).some(
      w => w.appId === app.id && !w.isClosing
    );
    if (alreadyOpen) {
      setPendingApp(app);
      return;
    }
    openApp(app.id, app.label);
  }

  function confirmNewInstance() {
    if (!pendingApp) return;
    openApp(pendingApp.id, pendingApp.label);
    setPendingApp(null);
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
          transform: 'translateZ(0)',
          willChange: 'transform',
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

      </div>

      <Modal
        open={!!pendingApp}
        onClose={() => setPendingApp(null)}
        title="Open another window?"
        closeOnOverlay
        size="sm"
        appearance="quiet"
        initialFocus="dialog"
      >
        {pendingApp && (
          <div className="font-sans">
            <p className="text-[13px] leading-5 text-gray-600 dark:text-white/55">
              {pendingApp.label} is already open. Would you like to open another window?
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingApp(null)}
                className="h-9 px-3.5 rounded-lg text-[12px] font-semibold text-gray-600 dark:text-white/55 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmNewInstance}
                className="h-9 px-3.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-[12px] font-semibold text-white transition-colors"
              >
                Open Window
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
