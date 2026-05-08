import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Minus, Maximize2, Square } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';

// macOS is the only shell now; all the per-OS branching below collapses
// to the macOS branch via this constant. Kept as a const so the existing
// `STYLE === 'macos'` checks throughout the file still resolve normally.
const STYLE = 'macos';

// macOS traffic lights. Green button = in-app "zoom" (full window inside
// the macOS shell — covers the dock area but stays inside the browser
// window). For TRUE OS-level fullscreen (taking over the whole monitor),
// use ⌘⇧P — that calls the browser Fullscreen API.
function MacTitleBar({ windowId, isMaximized, isActive, title, onDragStart, onDoubleClick, titlebarOpacity = 80 }) {
  const { closeWindow, minimizeWindow, maximizeWindow } = useWindowManager();
  const [hovered, setHovered] = useState(false);
  const isDark = document.documentElement.classList.contains('dark');
  const a = titlebarOpacity / 100;
  const barStyle = isDark
    ? { background: isActive ? `rgba(20,20,20,${a})` : `rgba(28,28,28,${a})` }
    : { background: isActive ? `rgba(232,232,234,${a})` : `rgba(240,240,240,${a})` };
  return (
    <div className="h-8 flex items-center flex-shrink-0 select-none backdrop-blur-md" style={barStyle} onPointerDown={onDragStart} onDoubleClick={onDoubleClick} data-titlebar={windowId}>
      <div className="flex items-center gap-[7px] px-3" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button onClick={e => { e.stopPropagation(); closeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#FF5F57] hover:brightness-90 flex items-center justify-center" title="Close"><X size={hovered ? 8 : 0} strokeWidth={2.5} className="text-[#4a0002]" /></button>
        <button onClick={e => { e.stopPropagation(); minimizeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:brightness-90 flex items-center justify-center" title="Minimize"><Minus size={hovered ? 8 : 0} strokeWidth={2.5} className="text-[#5a3e00]" /></button>
        <button onClick={e => { e.stopPropagation(); maximizeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#28C840] hover:brightness-90 flex items-center justify-center" title={isMaximized ? 'Restore' : 'Zoom — fills the desktop. ⌘⇧P for true fullscreen.'}><Maximize2 size={hovered ? 7 : 0} strokeWidth={2.5} className="text-[#005200]" /></button>
      </div>
      <div className="flex-1 text-center text-xs font-medium text-gray-600 dark:text-white/60 truncate pr-12 pointer-events-none">{title}</div>
    </div>
  );
}

// Windows-style title bar (buttons on right)
function WindowsTitleBar({ windowId, isMaximized, isActive, title, onDragStart, onDoubleClick }) {
  const { closeWindow, minimizeWindow, maximizeWindow } = useWindowManager();
  const dark = document.documentElement.classList.contains('dark');
  return (
    <div className={`h-8 flex items-center flex-shrink-0 ${isActive ? (dark ? 'bg-[#1f1f1f]' : 'bg-white') : (dark ? 'bg-[#2d2d2d]' : 'bg-[#f0f0f0]')}`} onPointerDown={onDragStart} onDoubleClick={onDoubleClick} data-titlebar={windowId} style={{ borderBottom: dark ? '1px solid #3a3a3a' : '1px solid #e0e0e0' }}>
      <div className={`pl-3 text-xs font-normal truncate flex-1 ${isActive ? (dark ? 'text-white' : 'text-gray-900') : (dark ? 'text-gray-500' : 'text-gray-400')}`}>{title}</div>
      <div className="flex items-center h-full">
        <button onClick={e => { e.stopPropagation(); minimizeWindow(windowId); }} className={`h-full px-3 flex items-center justify-center ${dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}><Minus size={12} /></button>
        <button onClick={e => { e.stopPropagation(); maximizeWindow(windowId); }} className={`h-full px-3 flex items-center justify-center ${dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}><Square size={10} /></button>
        <button onClick={e => { e.stopPropagation(); closeWindow(windowId); }} className="h-full px-3 flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-400"><X size={14} /></button>
      </div>
    </div>
  );
}

// ChromeOS / Linux title bar (close on right, minimal)
function GenericTitleBar({ windowId, isMaximized, isActive, title, onDragStart, onDoubleClick }) {
  const { closeWindow, minimizeWindow, maximizeWindow } = useWindowManager();
  const dark = document.documentElement.classList.contains('dark');
  return (
    <div className={`h-8 flex items-center flex-shrink-0 ${isActive ? (dark ? 'bg-[#2b2b35]' : 'bg-[#e8e8ec]') : (dark ? 'bg-[#353540]' : 'bg-[#ededf0]')}`} onPointerDown={onDragStart} onDoubleClick={onDoubleClick} data-titlebar={windowId}>
      <div className={`flex-1 text-center text-xs font-medium truncate px-3 ${isActive ? (dark ? 'text-white' : 'text-gray-900') : (dark ? 'text-gray-500' : 'text-gray-400')}`}>{title}</div>
      <div className="flex items-center h-full">
        <button onClick={e => { e.stopPropagation(); minimizeWindow(windowId); }} className={`h-full px-2.5 flex items-center justify-center ${dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}><Minus size={12} /></button>
        <button onClick={e => { e.stopPropagation(); maximizeWindow(windowId); }} className={`h-full px-2.5 flex items-center justify-center ${dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}><Maximize2 size={11} /></button>
        <button onClick={e => { e.stopPropagation(); closeWindow(windowId); }} className="h-full px-2.5 flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-400 rounded-tr-xl"><X size={14} /></button>
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
      const topBar = STYLE === 'windows' || STYLE === 'chromeos' ? 0 : 28;
      const bottomBar = STYLE === 'windows' ? 40 : STYLE === 'chromeos' ? 48 : STYLE === 'linux' ? 0 : 72;
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
      const topBar = STYLE === 'windows' || STYLE === 'chromeos' ? 0 : 28;
      const bottomBar = STYLE === 'windows' ? 40 : STYLE === 'chromeos' ? 48 : STYLE === 'linux' ? 0 : 72;
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

  // Fullscreen dimensions per OS style
  let maxStyle;
  if (STYLE === 'windows') {
    // Windows: full screen above taskbar (40px bottom)
    maxStyle = { left: 0, top: 0, width: '100vw', height: 'calc(100vh - 40px)' };
  } else if (STYLE === 'chromeos') {
    // ChromeOS: full screen above shelf (48px bottom)
    maxStyle = { left: 0, top: 0, width: '100vw', height: 'calc(100vh - 48px)' };
  } else if (STYLE === 'linux') {
    // Linux GNOME: below top panel (28px), full width, above dash (left 48px ignored — full width is fine)
    maxStyle = { left: 0, top: 28, width: '100vw', height: 'calc(100vh - 28px)' };
  } else {
    // macOS: in-app zoom covers the ENTIRE viewport — menu bar AND dock
    // hide (handled by MacOSContent reading window-manager state). The
    // window goes edge-to-edge (0,0 → 100vw × 100vh). For true OS-level
    // fullscreen across multiple monitors / browser chrome, use ⌘⇧P.
    maxStyle = { left: 0, top: 0, width: '100vw', height: '100vh' };
  }

  const style = maxed
    ? { ...maxStyle, zIndex: win.zIndex }
    : { left: win.position.x, top: win.position.y, width: win.size.w, height: win.size.h, zIndex: win.zIndex };

  // Opening/closing keyframe classes only — minimize/restore are handled
  // below via a CSS transition on transform/opacity (simpler, no state race).
  const animClass =
    animState === 'opening' ? 'window-opening' :
    animState === 'closing' ? 'window-closing' :
    '';

  // Pick title bar based on desktop style
  const TitleBar = STYLE === 'windows' ? WindowsTitleBar : STYLE === 'chromeos' || STYLE === 'linux' ? GenericTitleBar : MacTitleBar;

  // Window border radius: macOS = rounded, Windows = sharp corners,
  // others = slightly rounded. Snapped to `rounded-none` whenever the
  // window is taking the full screen (zoom OR browser fullscreen) so
  // the corners don't leave dark gaps against the desktop / OS chrome.
  const radius = (maxed || isFullscreen)
    ? 'rounded-none'
    : (STYLE === 'windows' ? 'rounded-sm' : STYLE === 'macos' ? 'rounded-xl' : 'rounded-lg');

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
      <TitleBar windowId={win.id} isMaximized={maxed} isActive={isActive} title={win.title} onDragStart={handleDragStart} onDoubleClick={() => maximizeWindow(win.id)} onFullscreen={toggleFullscreen} titlebarOpacity={titlebarOpacity ?? 80} />

      <div
        className="flex-1 overflow-hidden"
        style={{
          background: document.documentElement.classList.contains('dark')
            ? `rgba(0,0,0,${(windowOpacity ?? 55) / 100})`
            : `rgba(255,255,255,${(windowOpacity ?? 55) / 100})`
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
