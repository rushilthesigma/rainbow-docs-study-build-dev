import { useState, useEffect, useRef } from 'react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import APP_REGISTRY from './appRegistry';

export default function ContextMenu({ onSpotlight }) {
  const [menu, setMenu] = useState(null); // { x, y }
  const [windowMenu, setWindowMenu] = useState(null); // { x, y, windowId }
  const { openApp, closeWindow, minimizeWindow, maximizeWindow, state } = useWindowManager();
  const { wallpaper, setWallpaper } = useUIPreference();
  const menuRef = useRef(null);

  useEffect(() => {
    function handleContext(e) {
      // Check if right-clicked on a window title bar
      const titleBar = e.target.closest('[data-titlebar]');
      if (titleBar) {
        e.preventDefault();
        setWindowMenu({ x: e.clientX, y: e.clientY, windowId: titleBar.dataset.titlebar });
        setMenu(null);
        return;
      }

      // Only show desktop context menu if clicking on background (not on windows/dock)
      const onWindow = e.target.closest('.absolute.flex.flex-col');
      const onDock = e.target.closest('.dock-icon');
      const onMenuBar = e.target.closest('[class*="z-[1100]"]');
      if (onWindow || onDock || onMenuBar) return;

      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
      setWindowMenu(null);
    }

    function handleClick() { setMenu(null); setWindowMenu(null); }

    document.addEventListener('contextmenu', handleContext);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('contextmenu', handleContext);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  // Desktop right-click menu
  if (menu) {
    return (
      <div
        ref={menuRef}
        className="fixed z-[2000] w-52 rounded-xl overflow-hidden shadow-2xl py-1"
        style={{
          left: Math.min(menu.x, window.innerWidth - 220),
          top: Math.min(menu.y, window.innerHeight - 300),
          background: 'rgba(30, 30, 40, 0.85)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <MenuItem label="New Window..." onClick={() => { onSpotlight?.(); setMenu(null); }} shortcut="⌘K" />
        <Divider />
        <MenuItem label="Change Wallpaper" disabled />
        <div className="flex gap-1 px-3 py-1.5">
          {['nebula', 'carina', 'galaxy', 'cosmos'].map(wp => (
            <button key={wp} onClick={() => { setWallpaper(wp); setMenu(null); }} className={`w-8 h-5 rounded border ${wallpaper === wp ? 'border-blue-500' : 'border-white/10'}`} style={{ background: wp === 'nebula' ? 'linear-gradient(135deg, #1a0533, #0d1117)' : `url(https://images.unsplash.com/photo-${wp === 'carina' ? '1462331940025-496dfbfc7564' : wp === 'galaxy' ? '1506318137071-a8e063b4bec0' : '1451187580459-43490279c0fa'}?w=80&q=30)`, backgroundSize: 'cover' }} />
          ))}
        </div>
        <Divider />
        {APP_REGISTRY.filter(a => !['settings', 'newcurriculum'].includes(a.id)).slice(0, 5).map(app => {
          const Icon = app.icon;
          return <MenuItem key={app.id} label={`Open ${app.label}`} icon={<Icon size={13} />} onClick={() => { openApp(app.id, app.label); setMenu(null); }} />;
        })}
        <Divider />
        <MenuItem label="Settings" onClick={() => { openApp('settings', 'Settings'); setMenu(null); }} />
      </div>
    );
  }

  // Window title bar right-click menu
  if (windowMenu) {
    const win = state.windows[windowMenu.windowId];
    if (!win) return null;
    return (
      <div
        className="fixed z-[2000] w-44 rounded-xl overflow-hidden shadow-2xl py-1"
        style={{
          left: Math.min(windowMenu.x, window.innerWidth - 180),
          top: Math.min(windowMenu.y, window.innerHeight - 200),
          background: 'rgba(30, 30, 40, 0.85)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <MenuItem label={win.isMaximized ? "Restore" : "Maximize"} onClick={() => { maximizeWindow(win.id); setWindowMenu(null); }} />
        <MenuItem label="Minimize" onClick={() => { minimizeWindow(win.id); setWindowMenu(null); }} />
        <Divider />
        <MenuItem label="Close Window" onClick={() => { closeWindow(win.id); setWindowMenu(null); }} danger />
      </div>
    );
  }

  return null;
}

function MenuItem({ label, onClick, icon, shortcut, disabled, danger }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${disabled ? 'text-white/25 cursor-default' : danger ? 'text-red-400 hover:bg-red-500/20' : 'text-white/80 hover:bg-white/10'}`}
    >
      {icon && <span className="w-4 flex-shrink-0">{icon}</span>}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-white/30">{shortcut}</span>}
    </button>
  );
}

function Divider() {
  return <div className="h-px bg-white/10 my-1 mx-2" />;
}
