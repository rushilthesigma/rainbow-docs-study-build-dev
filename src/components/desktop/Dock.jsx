import { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { checkAdmin } from '../../api/admin';
import { Z } from '../../styles/tokens';

// macOS-style floating dock, ported from EngOS.
//
//   • Centered floating pill at the bottom, glass background + inner highlight
//   • Squircle (rounded-[26%]) app icons with a glossy top sheen + inset shadow
//   • Magnification: distance-based scale via framer-motion's useTransform +
//     useSpring, peaking when the cursor centers on an icon
//   • Running indicator: a tiny white pip below open apps
//   • Trash at the end — clears all open windows
//
// Preserves the `.dock-icon` class (ContextMenu reads it for right-click
// detection) and `data-tour="curricula-icon"` attribute (GuidedTour reads it).

const DOCK_SIZES = { small: 56, medium: 72, large: 92 };
const MAGNIFY_RADIUS = 110;

function useIconSize(mouseX, ref, iconBase, iconMax) {
  // Re-derived each frame from the parent dock's mouseX. When the cursor is
  // null (mouseLeave) we send the distance well beyond MAGNIFY_RADIUS so the
  // icon settles back to base size.
  const distance = useTransform(mouseX, (mx) => {
    if (mx === null || !ref.current) return MAGNIFY_RADIUS * 2;
    const parent = ref.current.parentElement;
    if (!parent) return MAGNIFY_RADIUS * 2;
    const pr = parent.getBoundingClientRect();
    const ir = ref.current.getBoundingClientRect();
    const center = ir.left - pr.left + ir.width / 2;
    return Math.abs(mx - center);
  });
  const sizeRaw = useTransform(distance, [0, MAGNIFY_RADIUS], [iconMax, iconBase], { clamp: true });
  return useSpring(sizeRaw, { stiffness: 320, damping: 26, mass: 0.4 });
}

function DockIcon({ app, mouseX, iconBase, iconMax, isOpen, launching, onClick, iconStyle }) {
  const ref = useRef(null);
  const size = useIconSize(mouseX, ref, iconBase, iconMax);
  const [hover, setHover] = useState(false);
  const Icon = app.icon;
  const iconPx = Math.max(20, Math.round(iconBase * 0.52));

  // EngOS-style accent: prefer app.gradient (existing in registry); fall back
  // to the EngOS default blue→purple. The other iconStyle variants (mono /
  // glass / accent) still work and just swap the background recipe.
  const baseGradient = iconStyle === 'mono'
    ? { background: '#2a2a2e' }
    : iconStyle === 'glass'
      ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }
      : iconStyle === 'accent'
        ? { backgroundColor: `${app.color}22`, border: `1px solid ${app.color}44` }
        : { background: app.cssGradient || 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' };

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center justify-end"
      style={{ width: iconMax, height: iconMax }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[12px] glass-strong text-white whitespace-nowrap pointer-events-none">
          {app.label}
        </div>
      )}
      <motion.button
        onClick={onClick}
        data-tour={app.id === 'curricula' ? 'curricula-icon' : undefined}
        style={{ width: size, height: size, borderRadius: '26%', ...(iconStyle === 'gradient' || !iconStyle ? {} : baseGradient) }}
        whileTap={{ scale: 0.92 }}
        className={`dock-icon relative flex items-center justify-center shadow-lg border border-white/15 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
          launching ? 'animate-dock-bounce' : ''
        }`}
      >
        {/* base gradient layer — only for the 'gradient' iconStyle, so the
            other three (mono / glass / accent) can use the style prop above. */}
        {(iconStyle === 'gradient' || !iconStyle) && (
          <div
            className="absolute inset-0"
            style={baseGradient}
          />
        )}
        {/* glossy top sheen */}
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.00) 100%)' }}
        />
        {/* inner ring + soft inset shadow at the bottom — the depth cue that
            sells the squircle as a physical button. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ borderRadius: '26%', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 14px -8px rgba(0,0,0,0.40)' }}
        />
        <Icon
          className={iconStyle === 'accent' ? 'drop-shadow relative z-10' : 'text-white drop-shadow relative z-10'}
          style={iconStyle === 'accent' ? { color: app.color } : undefined}
          size={iconPx}
          strokeWidth={1.8}
        />
      </motion.button>
      {/* running indicator — a tiny white pip pinned just under the icon. */}
      <div
        className={`absolute -bottom-0.5 w-1.5 h-1.5 rounded-full transition-all ${
          isOpen ? 'bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.5)]' : 'bg-transparent'
        }`}
      />
    </div>
  );
}

function TrashIcon({ mouseX, iconBase, iconMax, onClick }) {
  const ref = useRef(null);
  const size = useIconSize(mouseX, ref, iconBase, iconMax);
  const iconPx = Math.max(20, Math.round(iconBase * 0.46));
  const [hover, setHover] = useState(false);
  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center justify-end"
      style={{ width: iconMax, height: iconMax }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[12px] glass-strong text-white whitespace-nowrap pointer-events-none">
          Trash — close all
        </div>
      )}
      <motion.button
        onClick={onClick}
        style={{ width: size, height: size, borderRadius: '26%' }}
        whileTap={{ scale: 0.92 }}
        className="dock-icon relative flex items-center justify-center bg-white/[0.08] border border-white/15 backdrop-blur-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        title="Close all open windows"
      >
        <div
          className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)' }}
        />
        <Trash2 className="text-white/85 relative z-10" size={iconPx} strokeWidth={1.8} />
      </motion.button>
    </div>
  );
}

export default function Dock() {
  const { state, openApp, closeWindow, restoreWindow, focusWindow } = useWindowManager();
  const { dockSize, iconStyle } = useUIPreference();
  const iconMax = DOCK_SIZES[dockSize] || 72;
  const iconBase = Math.max(40, Math.round(iconMax * 0.67));
  const mouseX = useMotionValue(null);

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  // Track recently-launched apps so we can run the bounce animation once
  // per click. Cleared 600ms after the click — matches the keyframe length.
  const [launching, setLaunching] = useState(() => new Set());
  function markLaunching(id) {
    setLaunching((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setLaunching((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 600);
  }

  const mainApps = APP_REGISTRY.filter(a =>
    !['settings', 'newcurriculum'].includes(a.id)
    && !a.engineeringTool
    && (!a.adminOnly || isAdmin),
  );
  const engineeringApps = APP_REGISTRY.filter(a => a.engineeringTool && !a.adminLaunchpad);
  const utilApps = APP_REGISTRY.filter(a => ['settings'].includes(a.id));
  const openAppIds = new Set(Object.values(state.windows).map(w => w.appId));

  function handleIconClick(app) {
    const existing = Object.values(state.windows).find(w => w.appId === app.id);
    if (existing?.isMinimized) restoreWindow(existing.id);
    else if (existing) focusWindow(existing.id);
    else {
      openApp(app.id, app.label, true);
      markLaunching(app.id);
    }
  }

  function clearAllWindows() {
    const ids = Object.values(state.windows).filter(w => !w.isClosing).map(w => w.id);
    ids.forEach((id) => closeWindow(id));
  }

  return (
    <div
      className="fixed bottom-2 left-0 right-0 flex justify-center pointer-events-none"
      style={{ zIndex: Z.dock }}
    >
      <div
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          mouseX.set(e.clientX - rect.left);
        }}
        onMouseLeave={() => mouseX.set(null)}
        className="pointer-events-auto rounded-3xl px-3 flex items-end gap-2"
        style={{
          height: iconMax,
          paddingBottom: 6,
          paddingTop: 6,
          background: 'rgba(28, 28, 36, 0.55)',
          backdropFilter: 'blur(34px) saturate(180%)',
          WebkitBackdropFilter: 'blur(34px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 12px 36px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        {mainApps.map((app) => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            iconBase={iconBase}
            iconMax={iconMax}
            isOpen={openAppIds.has(app.id)}
            launching={launching.has(app.id)}
            onClick={() => handleIconClick(app)}
            iconStyle={iconStyle}
          />
        ))}

        {engineeringApps.length > 0 && (
          <div className="w-px self-center bg-white/15" style={{ height: iconMax * 0.62 }} />
        )}

        {engineeringApps.map((app) => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            iconBase={iconBase}
            iconMax={iconMax}
            isOpen={openAppIds.has(app.id)}
            launching={launching.has(app.id)}
            onClick={() => handleIconClick(app)}
            iconStyle={iconStyle}
          />
        ))}

        <div className="w-px self-center bg-white/15" style={{ height: iconMax * 0.62 }} />

        {utilApps.map((app) => (
          <DockIcon
            key={app.id}
            app={app}
            mouseX={mouseX}
            iconBase={iconBase}
            iconMax={iconMax}
            isOpen={openAppIds.has(app.id)}
            launching={launching.has(app.id)}
            onClick={() => handleIconClick(app)}
            iconStyle={iconStyle}
          />
        ))}

        <TrashIcon mouseX={mouseX} iconBase={iconBase} iconMax={iconMax} onClick={clearAllWindows} />
      </div>
    </div>
  );
}
