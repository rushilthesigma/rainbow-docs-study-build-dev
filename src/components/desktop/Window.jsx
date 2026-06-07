import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { X, Minus, Maximize2 } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';

// macOS traffic lights. Green button = in-app "zoom" (full window inside
// the macOS shell - covers the dock area but stays inside the browser
// window). For TRUE OS-level fullscreen (taking over the whole monitor),
// use ⌘⇧P - that calls the browser Fullscreen API.
function MacTitleBar({ windowId, isActive, title, onDragStart, onDoubleClick, titlebarOpacity = 80 }) {
  const { closeWindow, minimizeWindow, maximizeWindow } = useWindowManager();
  const [hovered, setHovered] = useState(false);
  const isDark = document.documentElement.classList.contains('dark');
  const a = titlebarOpacity / 100;
  const barStyle = isDark
    ? {
        background: isActive ? `rgba(36, 36, 40, ${a})` : `rgba(30, 30, 34, ${a})`,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }
    : { background: isActive ? `rgba(232,232,234,${a})` : `rgba(240,240,240,${a})` };
  return (
    // position:relative + zIndex:1 keeps this above the dedicated blur layer below it.
    <div className="h-8 flex items-center flex-shrink-0 select-none" style={{ ...barStyle, position: 'relative', zIndex: 1 }} onPointerDown={onDragStart} onDoubleClick={onDoubleClick} data-titlebar={windowId}>
      <div className="flex items-center gap-[7px] px-3" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button onClick={e => { e.stopPropagation(); closeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#FF5F57] hover:brightness-90 flex items-center justify-center" title="Close"><X size={hovered ? 8 : 0} strokeWidth={2.5} className="text-[#4a0002]" /></button>
        <button onClick={e => { e.stopPropagation(); minimizeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:brightness-90 flex items-center justify-center" title="Minimize"><Minus size={hovered ? 8 : 0} strokeWidth={2.5} className="text-[#5a3e00]" /></button>
        <button onClick={e => { e.stopPropagation(); maximizeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#28C840] hover:brightness-90 flex items-center justify-center" title="Zoom - fills the desktop. ⌘⇧P for true fullscreen."><Maximize2 size={hovered ? 7 : 0} strokeWidth={2.5} className="text-[#005200]" /></button>
      </div>
      <div className="flex-1 text-center text-xs font-medium text-gray-600 dark:text-white/65 truncate pr-12 pointer-events-none">{title}</div>
    </div>
  );
}

function Window({ win, isActive, children }) {
  const { focusWindow, moveWindow, resizeWindow, removeWindow, maximizeWindow } = useWindowManager();
  const { windowOpacity, titlebarOpacity } = useUIPreference();
  const windowRef = useRef(null);
  const resizeRef = useRef(null);
  const [animState, setAnimState] = useState('opening');

  useEffect(() => { const t = setTimeout(() => setAnimState('idle'), 200); return () => clearTimeout(t); }, []);
  useEffect(() => { if (win.isClosing) { setAnimState('closing'); const t = setTimeout(() => removeWindow(win.id), 150); return () => clearTimeout(t); } }, [win.isClosing]);

  const handleDragStart = useCallback((e) => {
    if (win.isMaximized) return;
    e.preventDefault();
    const startX = e.clientX - win.position.x;
    const startY = e.clientY - win.position.y;
    const posRef = { x: win.position.x, y: win.position.y };
    // Kill the geometry transition for the duration of the drag so it feels snappy
    const el = windowRef.current;
    const prevTransition = el ? el.style.transition : '';
    if (el) el.style.transition = 'none';
    function onMove(ev) {
      // RushilAI menu bar is always 28px at the top. The floating
      // macOS dock sits at the bottom with ~84px of footprint
      // (icon + indicator row + padding + bottom offset). Both
      // constraints apply unconditionally so a dragged window can
      // never slip behind the chrome.
      const topBar = 28;
      const bottomBar = 84;
      const maxX = window.innerWidth - win.size.w;
      const maxY = window.innerHeight - win.size.h - bottomBar;
      posRef.x = Math.max(0, Math.min(maxX, ev.clientX - startX));
      posRef.y = Math.max(topBar, Math.min(maxY, ev.clientY - startY));
      if (windowRef.current) { windowRef.current.style.left = posRef.x + 'px'; windowRef.current.style.top = posRef.y + 'px'; }
    }
    function onUp() {
      if (el) el.style.transition = prevTransition;
      moveWindow(win.id, posRef);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [win.id, win.position, win.size, win.isMaximized, moveWindow]);

  const handleResizeStart = useCallback((e, dir) => {
    if (win.isMaximized) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startPos = { ...win.position }; const startSize = { ...win.size };
    const el = windowRef.current;
    const prevTransition = el ? el.style.transition : '';
    if (el) el.style.transition = 'none';
    function onMove(ev) {
      const dx = ev.clientX - startX; const dy = ev.clientY - startY;
      const vw = window.innerWidth; const vh = window.innerHeight;
      // Same fixed top/bottom reserves as the drag handler - menu bar
      // 28px, floating macOS dock 84px, both always present.
      const topBar = 28;
      const bottomBar = 84;
      let x = startPos.x, y = startPos.y, w = startSize.w, h = startSize.h;
      if (dir.includes('e')) w = Math.min(vw - x, Math.max(400, startSize.w + dx));
      if (dir.includes('w')) { w = Math.max(400, startSize.w - dx); x = startPos.x + (startSize.w - w); if (x < 0) { w += x; x = 0; } }
      if (dir.includes('s')) h = Math.min(vh - y - bottomBar, Math.max(300, startSize.h + dy));
      if (dir.includes('n')) { h = Math.max(300, startSize.h - dy); y = startPos.y + (startSize.h - h); if (y < topBar) { h -= (topBar - y); y = topBar; } }
      if (windowRef.current) { windowRef.current.style.left = x + 'px'; windowRef.current.style.top = y + 'px'; windowRef.current.style.width = w + 'px'; windowRef.current.style.height = h + 'px'; }
      resizeRef.current = { size: { w, h }, position: { x, y } };
    }
    function onUp() {
      if (el) el.style.transition = prevTransition;
      if (resizeRef.current) resizeWindow(win.id, resizeRef.current.size, resizeRef.current.position);
      resizeRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
  }, [win.id, win.position, win.size, win.isMaximized, resizeWindow]);

  // Keep minimized apps MOUNTED so they don't lose state (chat transcripts,
  // running streams, form inputs). Just hide them visually.
  const minimized = win.isMinimized;
  const maxed = win.isMaximized;

  // ===== Real fullscreen (browser-level, OS-level) =====
  // The green traffic-light button calls this. ESC exits - that's
  // browser-native behavior of the Fullscreen API; we don't need a
  // separate keydown listener. We DO listen for `fullscreenchange` so
  // a tracked `isFullscreen` flag stays in sync (used to hide our
  // resize handles + adjust styling while in real fullscreen).
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function onChange() {
      const el = windowRef.current;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(!!el && fsEl === el);
    }
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = windowRef.current;
    if (!el) return;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl === el) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else {
      // focus this window first so it sits on top while entering fullscreen
      focusWindow(win.id);
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      req?.call(el).catch(() => { /* user-activation lost or already fs */ });
    }
  }, [focusWindow, win.id]);

  // Maximize = TRUE fullscreen. Window covers the entire viewport,
  // edge-to-edge. The menu bar and dock both hide for maximized
  // windows (see DesktopShell's `anyMaximized` gate) so nothing
  // obstructs the app.
  const maxStyle = { left: 0, top: 0, width: '100vw', height: '100vh' };

  const style = maxed
    ? { ...maxStyle, zIndex: win.zIndex }
    : { left: win.position.x, top: win.position.y, width: win.size.w, height: win.size.h, zIndex: win.zIndex };

  // Opening/closing keyframe classes only - minimize/restore are handled
  // below via a CSS transition on transform/opacity (simpler, no state race).
  const animClass =
    animState === 'opening' ? 'window-opening' :
    animState === 'closing' ? 'window-closing' :
    '';

  // macOS chrome - soft rounded corners on a floating window. Snapped
  // to `rounded-none` whenever the window is taking the full screen
  // (zoom OR browser fullscreen) so corners don't leave dark gaps
  // against the desktop / OS chrome.
  const TitleBar = MacTitleBar;
  const radius = (maxed || isFullscreen) ? 'rounded-none' : 'rounded-xl';

  const fullBleed = maxed || isFullscreen;

  return (
    <div
      ref={windowRef}
      className={`absolute flex flex-col ${radius} overflow-hidden ${animClass}`}
      style={{
        ...style,
        // Belt-and-suspenders for the rounded-none class - explicit
        // borderRadius:0 so any inherited radius from a parent (or a
        // hot-reload class race) can't reintroduce visible corners.
        ...(fullBleed ? { borderRadius: 0 } : null),
        // Minimize = shrink + fade (CSS-transition driven, never unmount).
        // translateZ(0) + willChange keep the window on its own compositor
        // layer for smooth position/minimize transitions.
        transform: minimized ? 'scale(0.2) translateZ(0)' : 'scale(1) translateZ(0)',
        willChange: 'transform',
        transformOrigin: 'bottom center',
        opacity: minimized ? 0 : 1,
        pointerEvents: minimized ? 'none' : 'auto',
        // Drop shadows + the 1px white outline are great for floating
        // windows but render as a visible halo when the window covers
        // the whole viewport. Kill the shadow when full-bleed.
        boxShadow: fullBleed
          ? 'none'
          : isActive
            ? '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)'
            : '0 10px 30px -8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
        transition:
          'left 0.25s cubic-bezier(0.22, 1, 0.36, 1),' +
          ' top 0.25s cubic-bezier(0.22, 1, 0.36, 1),' +
          ' width 0.25s cubic-bezier(0.22, 1, 0.36, 1),' +
          ' height 0.25s cubic-bezier(0.22, 1, 0.36, 1),' +
          ' transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),' +
          ' opacity 0.2s ease-in-out,' +
          ' box-shadow 0.15s',
      }}
      aria-hidden={minimized}
      onPointerDown={() => focusWindow(win.id)}
    >
      {/* ── Dedicated blur layer ──────────────────────────────────────────
          This is the ONLY element that carries backdrop-filter. It is
          completely inert (no content, no props that ever change), so it
          never triggers a repaint on its own. When the desktop behind it
          updates (clock tick, widget drag, wallpaper), this layer briefly
          re-samples – but the title bar and content (zIndex:1 above it)
          remain painted throughout, so the window never flashes blank.
          Previously, backdrop-blur-xl lived on the Window root div, which
          repaints on every focus change / streaming chunk / keystroke.
          Each of those repaints triggered a full GPU backdrop re-sample
          that could drop the compositor layer for one frame → wallpaper
          flash. Isolating the blur here eliminates that race entirely. */}
      {!fullBleed && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            backdropFilter: 'blur(24px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
            willChange: 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            pointerEvents: 'none',
            zIndex: 0,
            borderRadius: 'inherit',
          }}
        />
      )}

      <TitleBar windowId={win.id} appId={win.appId} isMaximized={maxed} isActive={isActive} title={win.title} onDragStart={handleDragStart} onDoubleClick={maxed ? undefined : () => maximizeWindow(win.id)} onFullscreen={toggleFullscreen} titlebarOpacity={titlebarOpacity ?? 80} />

      <div
        className="flex-1 overflow-hidden"
        style={{
          position: 'relative', zIndex: 1,
          background: document.documentElement.classList.contains('dark')
            ? `rgba(24, 24, 24, ${(windowOpacity ?? 100) / 100})`
            : `rgba(255,255,255,${(windowOpacity ?? 100) / 100})`
        }}
      >
        {children}
      </div>

      {!maxed && !isFullscreen && !win.fixedSize && <>
        <div className="absolute top-0 left-0 right-0 h-1 cursor-n-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'n')} />
        <div className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 's')} />
        <div className="absolute top-0 left-0 bottom-0 w-1 cursor-w-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'w')} />
        <div className="absolute top-0 right-0 bottom-0 w-1 cursor-e-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'e')} />
        <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'nw')} />
        <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'ne')} />
        <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'sw')} />
        <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" style={{ zIndex: 10 }} onPointerDown={e => handleResizeStart(e, 'se')} />
      </>}
    </div>
  );
}

// Memoize so that only the window whose `win` object or `isActive` flag
// actually changed re-renders. Without this, every FOCUS_WINDOW / MOVE_WINDOW
// dispatch re-renders ALL open windows — each re-render applies new inline
// styles to the blur layer, which triggers a backdrop-filter GPU re-sample
// that can drop the compositor layer for one frame → wallpaper flash.
//
// `children` (AppWindow) is intentionally excluded from the comparator: it
// is always the same element type+props (derived from win.appId / win.meta
// which are covered by prev.win === next.win), and AppWindow manages its own
// state independently so it updates without needing Window to re-render it.
export default memo(Window, (prev, next) =>
  prev.win === next.win && prev.isActive === next.isActive
);
