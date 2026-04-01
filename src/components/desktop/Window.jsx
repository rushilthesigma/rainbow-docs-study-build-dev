import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Minus, Maximize2, Columns2 } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';

function TrafficLights({ windowId, isMaximized, onSplit }) {
  const { closeWindow, minimizeWindow, maximizeWindow } = useWindowManager();
  const [hovered, setHovered] = useState(false);

  return (
    <div className="flex items-center gap-[7px] px-3" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button onClick={e => { e.stopPropagation(); closeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#FF5F57] hover:brightness-90 flex items-center justify-center transition-colors">
        {hovered && <X size={8} strokeWidth={2.5} className="text-[#4a0002]" />}
      </button>
      <button onClick={e => { e.stopPropagation(); minimizeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:brightness-90 flex items-center justify-center transition-colors">
        {hovered && <Minus size={8} strokeWidth={2.5} className="text-[#5a3e00]" />}
      </button>
      <button onClick={e => { e.stopPropagation(); maximizeWindow(windowId); }} className="w-3 h-3 rounded-full bg-[#28C840] hover:brightness-90 flex items-center justify-center transition-colors">
        {hovered && <Maximize2 size={7} strokeWidth={2.5} className="text-[#005200]" />}
      </button>
    </div>
  );
}

export default function Window({ win, isActive, children }) {
  const { focusWindow, moveWindow, resizeWindow, removeWindow, maximizeWindow } = useWindowManager();
  const windowRef = useRef(null);
  const resizeRef = useRef(null);
  const [animState, setAnimState] = useState('opening');

  useEffect(() => {
    const t = setTimeout(() => setAnimState('idle'), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (win.isClosing) {
      setAnimState('closing');
      const t = setTimeout(() => removeWindow(win.id), 150);
      return () => clearTimeout(t);
    }
  }, [win.isClosing]);

  // Drag — prevent dragging above the screen top
  const handleDragStart = useCallback((e) => {
    if (win.isMaximized) return;
    e.preventDefault();
    const startX = e.clientX - win.position.x;
    const startY = e.clientY - win.position.y;
    const posRef = { x: win.position.x, y: win.position.y };

    function onMove(ev) {
      const dockHeight = 72;
      const maxX = window.innerWidth - win.size.w;
      const maxY = window.innerHeight - win.size.h - dockHeight;
      posRef.x = Math.max(0, Math.min(maxX, ev.clientX - startX));
      posRef.y = Math.max(28, Math.min(maxY, ev.clientY - startY));
      if (windowRef.current) {
        windowRef.current.style.left = posRef.x + 'px';
        windowRef.current.style.top = posRef.y + 'px';
      }
    }
    function onUp() {
      moveWindow(win.id, posRef);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [win.id, win.position, win.size, win.isMaximized, moveWindow]);

  // Resize
  const handleResizeStart = useCallback((e, dir) => {
    if (win.isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startPos = { ...win.position };
    const startSize = { ...win.size };

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dockH = 72;
      let x = startPos.x, y = startPos.y, w = startSize.w, h = startSize.h;

      if (dir.includes('e')) w = Math.min(vw - x, Math.max(400, startSize.w + dx));
      if (dir.includes('w')) { w = Math.max(400, startSize.w - dx); x = startPos.x + (startSize.w - w); if (x < 0) { w += x; x = 0; } }
      if (dir.includes('s')) h = Math.min(vh - y - dockH, Math.max(300, startSize.h + dy));
      if (dir.includes('n')) { h = Math.max(300, startSize.h - dy); y = startPos.y + (startSize.h - h); if (y < 28) { h -= (28 - y); y = 28; } }

      if (windowRef.current) {
        windowRef.current.style.left = x + 'px';
        windowRef.current.style.top = y + 'px';
        windowRef.current.style.width = w + 'px';
        windowRef.current.style.height = h + 'px';
      }
      resizeRef.current = { size: { w, h }, position: { x, y } };
    }
    function onUp() {
      if (resizeRef.current) resizeWindow(win.id, resizeRef.current.size, resizeRef.current.position);
      resizeRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [win.id, win.position, win.size, win.isMaximized, resizeWindow]);

  if (win.isMinimized) return null;

  const maxed = win.isMaximized;
  const style = maxed
    ? { left: 0, top: 28, width: '100vw', height: 'calc(100vh - 28px - 72px)', zIndex: win.zIndex }
    : { left: win.position.x, top: win.position.y, width: win.size.w, height: win.size.h, zIndex: win.zIndex };

  const animClass = animState === 'opening' ? 'window-opening' : animState === 'closing' ? 'window-closing' : '';

  return (
    <div
      ref={windowRef}
      className={`absolute flex flex-col rounded-xl overflow-hidden select-none ${animClass}`}
      style={{
        ...style,
        boxShadow: isActive
          ? '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)'
          : '0 10px 30px -8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
        transition: maxed ? 'left 0.25s, top 0.25s, width 0.25s, height 0.25s' : 'box-shadow 0.15s',
      }}
      onPointerDown={() => focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        className={`h-8 flex items-center flex-shrink-0 ${isActive ? 'bg-[#e8e8ea] dark:bg-[#2c2c2e]' : 'bg-[#f0f0f0] dark:bg-[#383838]'}`}
        data-titlebar={win.id}
        onPointerDown={handleDragStart}
        onDoubleClick={() => maximizeWindow(win.id)}
      >
        <TrafficLights windowId={win.id} isMaximized={maxed} />
        <div className="flex-1 text-center text-xs font-medium text-gray-600 dark:text-gray-300 truncate pr-12 pointer-events-none">
          {win.title}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-[#0D0D14]">
        {children}
      </div>

      {/* Resize handles */}
      {!maxed && <>
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
