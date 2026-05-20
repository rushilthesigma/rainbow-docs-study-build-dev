import { useState, useEffect, useCallback, useRef } from 'react';
import { WindowManagerProvider, useWindowManager } from '../../context/WindowManagerContext';
import DesktopBackground from './DesktopBackground';
import MenuBar from './MenuBar';
import Dock from './Dock';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import ContextMenu from './ContextMenu';
import GuidedTour from './GuidedTour';
import ShortcutsHelp from './ShortcutsHelp';

// Windows 11 is the only desktop shell. macOS / ChromeOS / Linux paths
// were removed along with the OS-style picker. The HTML root gets a
// hardcoded `os-windows` class so the Fluent-scoped index.css rules
// apply uniformly. The component is still named MacOSContent for
// historical churn-minimization; rename is a separate task.
function MacOSContent() {
  const { state, minimizeWindow, restoreWindow } = useWindowManager();
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const toggleSpotlight = useCallback(() => setSpotlightOpen(prev => !prev), []);

  // When the slides window is maximized, hide all other windows so the
  // presentation gets an uncluttered full-screen. When it un-maximizes,
  // restore exactly the windows that were visible before.
  const prevSlidesMaxRef = useRef(false);
  const hiddenForSlidesRef = useRef([]);
  useEffect(() => {
    const wins = Object.values(state.windows);
    const slidesWin = wins.find(w => w.appId === 'slides');
    const nowMax = !!(slidesWin?.isMaximized && !slidesWin?.isMinimized && !slidesWin?.isClosing);
    if (nowMax === prevSlidesMaxRef.current) return;
    const wasMax = prevSlidesMaxRef.current;
    prevSlidesMaxRef.current = nowMax;
    if (nowMax && !wasMax) {
      const toHide = wins
        .filter(w => w.appId !== 'slides' && !w.isMinimized && !w.isClosing)
        .map(w => w.id);
      hiddenForSlidesRef.current = toHide;
      toHide.forEach(id => minimizeWindow(id));
    } else if (!nowMax && wasMax) {
      const toRestore = hiddenForSlidesRef.current;
      hiddenForSlidesRef.current = [];
      setTimeout(() => toRestore.forEach(id => { if (state.windows[id]) restoreWindow(id); }), 250);
    }
  }, [state.windows, minimizeWindow, restoreWindow]);

  useEffect(() => {
    function handleKey(e) {
      // ⌘K or ⌘⇧1 → spotlight
      const cmdish = e.metaKey || e.ctrlKey;
      const isDigit1 = e.code === 'Digit1' || e.key === '1' || e.key === '!' || e.keyCode === 49;
      if (cmdish && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleSpotlight(); }
      else if (cmdish && e.shiftKey && isDigit1) { e.preventDefault(); toggleSpotlight(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleSpotlight]);

  const windows = Object.values(state.windows);
  // Any visible (not minimized / not closing) window in the maximized
  // state. When true the menu bar + dock get hidden so the zoomed
  // window goes truly edge-to-edge.
  const anyMaximized = windows.some(w => w.isMaximized && !w.isMinimized && !w.isClosing);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <DesktopBackground />
      {!anyMaximized && <MenuBar onSpotlight={toggleSpotlight} />}
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}
      {/* Dock stays visible even when a window is maximized — Windows-
          taskbar behavior. The menu bar still hides on maximize so the
          window can claim the full top of the screen. */}
      <Dock onSpotlight={toggleSpotlight} />
      <ContextMenu onSpotlight={toggleSpotlight} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}

function ShellContent() {
  const { state, closeWindow, minimizeWindow, focusWindow, restoreWindow } = useWindowManager();
  const [helpOpen, setHelpOpen] = useState(false);

  // Tag <html> with `os-windows` so the Fluent-scoped CSS rules in
  // index.css kick in. The shell is Win11-only now — no more dynamic
  // os-style switching, no legacy macOS/ChromeOS/Linux migration.
  useEffect(() => {
    const root = document.documentElement;
    Array.from(root.classList).filter(c => c.startsWith('os-')).forEach(c => root.classList.remove(c));
    root.classList.add('os-windows');
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    function handler(e) {
      const cmdish = e.metaKey || e.ctrlKey;
      if (!cmdish) return;
      const t = e.target;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      // ⌘/ → shortcuts help (works even inside inputs)
      if (e.key === '/' || e.key === '?') { e.preventDefault(); setHelpOpen(p => !p); return; }

      // ⌘⇧P → TRUE OS-level fullscreen via the browser Fullscreen API.
      // Targets the active window's DOM element; ESC exits (browser-native).
      // The green traffic-light button does the in-app zoom only; ⌘⇧P is
      // the explicit gesture for the heavy "take over the whole monitor"
      // mode. Works even inside text fields.
      if (e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) {
          (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        } else if (state.activeWindowId) {
          const el = document.querySelector(`[data-titlebar="${state.activeWindowId}"]`)?.parentElement;
          if (el) {
            const req = el.requestFullscreen || el.webkitRequestFullscreen;
            req?.call(el).catch(() => {});
          }
        }
        return;
      }
      if (inField) return;

      if (e.key === 'w' || e.key === 'W') {
        if (state.activeWindowId) { e.preventDefault(); closeWindow(state.activeWindowId); }
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        if (state.activeWindowId) { e.preventDefault(); minimizeWindow(state.activeWindowId); }
        return;
      }
      const digit = parseInt(e.key, 10);
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
        const wins = Object.values(state.windows).filter(w => !w.isClosing);
        const target = wins[digit - 1];
        if (target) {
          e.preventDefault();
          if (target.isMinimized) restoreWindow(target.id);
          else focusWindow(target.id);
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.activeWindowId, state.windows, closeWindow, minimizeWindow, focusWindow, restoreWindow]);

  return (
    <>
      <MacOSContent />
      <GuidedTour />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

export default function DesktopShell() {
  return (
    <WindowManagerProvider>
      <ShellContent />
    </WindowManagerProvider>
  );
}
