import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WindowManagerProvider, useWindowManager } from '../../context/WindowManagerContext';
import { WidgetProvider, useWidgets } from '../../context/WidgetContext';
import DesktopBackground from './DesktopBackground';
import MenuBar from './MenuBar';
import Dock from './Dock';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import ContextMenu from './ContextMenu';
import GuidedTour from './GuidedTour';
import ShortcutsHelp from './ShortcutsHelp';
import DesktopWidgets from './DesktopWidgets';

// Null-rendering component that owns only the ⌘⇧H snap-grid shortcut.
// Keeping useWidgets() here (instead of in MacOSContent) means widget
// state changes — drag moves, clock ticks propagating through context —
// do NOT re-render MacOSContent or any of its Window children.
function SnapGridShortcut() {
  const { toggleSnapGrid } = useWidgets();
  useEffect(() => {
    function handleKey(e) {
      const cmdish = e.metaKey || e.ctrlKey;
      if (cmdish && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        toggleSnapGrid();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleSnapGrid]);
  return null;
}

// macOS is the only desktop shell. Win11 / ChromeOS / Linux paths were
// removed along with the OS-style picker. The HTML root gets a
// hardcoded `os-macos` class - there are no macOS-specific index.css
// rules at the moment, so `os-macos` is effectively the baseline (no
// forced font swap, no squared corners, components keep their declared
// Tailwind radii).
function MacOSContent() {
  const { state } = useWindowManager();
  // useWidgets() intentionally removed from this component — widget state
  // changes (drag, clock tick, etc.) must not re-render MacOSContent or
  // its Window children. SnapGridShortcut handles the one widget call.
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const toggleSpotlight = useCallback(() => setSpotlightOpen(prev => !prev), []);

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
      <SnapGridShortcut />
      <DesktopBackground />
      {!anyMaximized && <MenuBar onSpotlight={toggleSpotlight} />}
      <DesktopWidgets />
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} meta={win.meta} />
        </Window>
      ))}
      {/* Both the dock and the menu bar hide when a window is maximized
          so fullscreened apps get the entire viewport - true edge-to-
          edge fullscreen, no chrome peeking through at the bottom. */}
      {!anyMaximized && <Dock onSpotlight={toggleSpotlight} />}
      <ContextMenu onSpotlight={toggleSpotlight} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}

// Maps known URL paths to the dock app id they should open. When the
// router navigates to one of these (e.g. /parent from the ProfilePicker),
// DesktopShell opens the matching app window - the desktop doesn't use
// ClassicRoutes, so without this hook the URL change is silent.
const PATH_TO_APP = {
  '/settings':    { appId: 'settings',  title: 'Settings' },
  '/study':       { appId: 'study',     title: 'Study Mode' },
  '/notes':       { appId: 'notes',     title: 'Notes' },
  // Map URL also opens the merged Notes app, just on the Maps view.
  '/notes/map':   { appId: 'notes',     title: 'Notes', meta: { initialView: 'map' } },
};

function ShellContent() {
  const { state, openApp, closeWindow, minimizeWindow, focusWindow, restoreWindow } = useWindowManager();
  const location = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  // URL → window bridge. On mount AND whenever the path changes, if the
  // path matches a known app, open (or focus) that app's window. After
  // dispatching we rewrite the URL back to /dashboard so the same path
  // can be triggered again later (e.g. parent → kid → parent).
  useEffect(() => {
    const match = PATH_TO_APP[location.pathname];
    if (!match) return;
    const existing = Object.values(state.windows).find(w => w.appId === match.appId && !w.isClosing);
    if (existing) {
      if (existing.isMinimized) restoreWindow(existing.id);
      else focusWindow(existing.id);
    } else {
      openApp(match.appId, match.title, match.meta || true);
    }
    // Rewrite the URL without firing another effect cycle.
    navigate('/dashboard', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Tag <html> with `os-macos`. There are no macOS-specific overrides in
  // index.css right now - the class exists so future per-shell tweaks
  // have a hook, and so any stale `os-windows` / `os-chromeos` / `os-linux`
  // class left over from an earlier build gets cleared on mount.
  useEffect(() => {
    const root = document.documentElement;
    Array.from(root.classList).filter(c => c.startsWith('os-')).forEach(c => root.classList.remove(c));
    root.classList.add('os-macos');
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
      <WidgetProvider>
        <ShellContent />
      </WidgetProvider>
    </WindowManagerProvider>
  );
}
