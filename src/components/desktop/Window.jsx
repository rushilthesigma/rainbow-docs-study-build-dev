import { useRef, useEffect, useState, useCallback } from 'react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';

// macOS-style traffic-light title bar (EngOS chrome).
//
// Traffic lights live on the LEFT; the title is centered absolutely so it
// reads the same regardless of how many buttons render. Symbols inside the
// lights (×, −, +) only appear on hover for that subtle "they look like
// dots until you actually need them" effect.
//
// Slideshow forces maximize at open time (see OPEN_WINDOW reducer) and the
// green +-light is hidden for that app only — the deck workspace owns the
// viewport and there's nothing useful left to toggle.
function TrafficLight({ color, symbol, focused, hover, onClick, title }) {
  const bg = !focused && !hover
    ? '#6b7280'
    : color === 'red'
      ? 'var(--traffic-red)'
      : color === 'yellow'
        ? 'var(--traffic-yellow)'
        : 'var(--traffic-green)';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-3 h-3 rounded-full flex items-center justify-center text-[9px] font-bold text-black/70 leading-none transition-all hover:scale-110 active:scale-95"
      style={{
        background: bg,
        boxShadow: focused || hover
          ? 'inset 0 0.5px 0 rgba(255,255,255,0.4), inset 0 -0.5px 0 rgba(0,0,0,0.25)'
          : 'none',
      }}
      tabIndex={-1}
      title={title}
    >
      <span className={hover ? 'opacity-90' : 'opacity-0'}>{symbol}</span>
    </button>
  );
}

function MacTitleBar({ windowId, appId, isActive, title, onDragStart, onDoubleClick }) {
  const { closeWindow, minimizeWindow, maximizeWindow } = useWindowManager();
  const [hover, setHover] = useState(false);
  const hideGreen = appId === 'slides';
  return (
    <div
      className="h-9 flex items-center flex-shrink-0 chrome relative"
      style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      onPointerDown={onDragStart}
      onDoubleClick={onDoubleClick}
      data-titlebar={windowId}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-2 px-3">
        <TrafficLight color="red"    symbol="×" focused={isActive} hover={hover} onClick={() => closeWindow(windowId)} title="Close" />
        <TrafficLight color="yellow" symbol="−" focused={isActive} hover={hover} onClick={() => minimizeWindow(windowId)} title="Minimize" />
        {!hideGreen && (
          <TrafficLight color="green" symbol="+" focused={isActive} hover={hover} onClick={() => maximizeWindow(windowId)} title="Zoom" />
        )}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 text-[13px] font-medium text-white/85 truncate max-w-[60%] pointer-events-none">
        {title}
      </div>
    </div>
  );
}

export default function Window({ win, isActive, children }) {
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
      // EngOS chrome reserves: 28px menu bar at top, ~100px for the
      // floating dock at the bottom (its tallest setting + the 8px gap).
      const topBar = 28;
      const bottomBar = 100;
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
      // Same reserves as the drag handler — 28px menu bar + 100px dock.
      const topBar = 28;
      const bottomBar = 100;
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
  // The green traffic-light button calls this. ESC exits — that's
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

  // Maximize dimensions: full viewport width, claims the full top edge
  // (the menu bar hides on maximize via MacOSContent), and leaves room
  // at the bottom for the floating EngOS dock — its tallest 'large'
  // setting + the 8px bottom inset works out to ~100px reserved.
  const DOCK_RESERVE = 100;
  const maxStyle = { left: 0, top: 0, width: '100vw', height: `calc(100vh - ${DOCK_RESERVE}px)` };

  const style = maxed
    ? { ...maxStyle, zIndex: win.zIndex }
    : { left: win.position.x, top: win.position.y, width: win.size.w, height: win.size.h, zIndex: win.zIndex };

  // Opening/closing keyframe classes only — minimize/restore are handled
  // below via a CSS transition on transform/opacity (simpler, no state race).
  const animClass =
    animState === 'opening' ? 'window-opening' :
    animState === 'closing' ? 'window-closing' :
    '';

  // Win11 is the only chrome — square-ish corners (`rounded-sm`).
  // Snapped to `rounded-none` whenever the window is taking the full
  // screen (zoom OR browser fullscreen) so corners don't leave dark
  // gaps against the desktop / OS chrome.
  // EngOS chrome: traffic-light title bar, rounded-2xl corners when floating
  // (matches the 16px radius EngOS Window.tsx uses), no corner radius when
  // the window is full-bleed.
  const TitleBar = MacTitleBar;
  const radius = (maxed || isFullscreen) ? 'rounded-none' : 'rounded-2xl';

  const fullBleed = maxed || isFullscreen;

  return (
    <div
      ref={windowRef}
      className={`absolute flex flex-col ${radius} overflow-hidden ${animClass} backdrop-blur-xl`}
      style={{
        ...style,
        // Belt-and-suspenders for the rounded-none class — explicit
        // borderRadius:0 so any inherited radius from a parent (or a
        // hot-reload class race) can't reintroduce visible corners.
        ...(fullBleed ? { borderRadius: 0 } : null),
        // Minimize = shrink + fade (CSS-transition driven, never unmount).
        transform: minimized ? 'scale(0.2)' : 'scale(1)',
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
      <TitleBar windowId={win.id} appId={win.appId} isMaximized={maxed} isActive={isActive} title={win.title} onDragStart={handleDragStart} onDoubleClick={maxed ? undefined : () => maximizeWindow(win.id)} onFullscreen={toggleFullscreen} titlebarOpacity={titlebarOpacity ?? 80} />

      <div
        className="flex-1 overflow-hidden"
        style={{
          background: document.documentElement.classList.contains('dark')
            ? `rgba(24, 24, 24, ${(windowOpacity ?? 100) / 100})`
            : `rgba(255,255,255,${(windowOpacity ?? 100) / 100})`
        }}
      >
        {children}
      </div>

      {!maxed && !isFullscreen && !win.fixedSize && <>
        <div className="absolute top-0 left-0 right-0 h-1 cursor-n-resize" onPointerDown={e => handleResizeStart(e, 'n')} />
        <div className="absolute bottom-0 left-0 right-0 h-1 cursor-s-resize" onPointerDown={e => handleResizeStart(e, 's')} />
        <div className="absolute top-0 left-0 bottom-0 w-1 cursor-w-resize" onPointerDown={e => handleResizeStart(e, 'w')} />
        <div className="absolute top-0 right-0 bottom-0 w-1 cursor-e-resize" onPointerDown={e => handleResizeStart(e, 'e')} />
        <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize" onPointerDown={e => handleResizeStart(e, 'nw')} />
        <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize" onPointerDown={e => handleResizeStart(e, 'ne')} />
        <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize" onPointerDown={e => handleResizeStart(e, 'sw')} />
        <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize" onPointerDown={e => handleResizeStart(e, 'se')} />
      </>}
    </div>
  );
}
