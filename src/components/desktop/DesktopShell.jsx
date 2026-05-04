import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
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

// macOS is the only desktop shell. The Windows / ChromeOS / Linux
// alternates were removed — the OS-style picker is gone, and any
// `cov-desktop-style` value in localStorage is ignored.
function MacOSContent() {
  const { state } = useWindowManager();
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
      <DesktopBackground />
      {!anyMaximized && <MenuBar onSpotlight={toggleSpotlight} />}
      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}
      {!anyMaximized && <Dock />}
      <ContextMenu onSpotlight={toggleSpotlight} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}

// One-time forced-migration notice for users who previously had
// Windows / ChromeOS / Linux selected. localStorage `cov-desktop-style`
// holds their old choice; once we've shown the notice, `cov-os-migrated`
// is set so the modal never re-fires.
const OS_LABELS = { windows: 'Windows', chromeos: 'ChromeOS', linux: 'Linux', mobile: 'Mobile' };

function MigrationNotice({ priorOs, onClose }) {
  const label = OS_LABELS[priorOs] || priorOs;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] max-w-[90vw] rounded-2xl border border-blue-500/30 bg-[#0f1124] p-6 shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{label} is no longer supported</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">macOS is now the only supported shell.</p>
          </div>
        </div>
        <p className="text-[13px] text-gray-300 leading-relaxed mb-5">
          We've moved everyone to the macOS-style desktop. Your apps, lessons, and data are
          unchanged — only the shell chrome (windows, dock, menu bar) is different. There's no
          way back to {label} from this build.
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[13px] font-semibold shadow-lg shadow-blue-500/30"
          >
            Continue to macOS
          </button>
        </div>
      </div>
    </div>
  );
}

function ShellContent() {
  const { state, closeWindow, minimizeWindow, focusWindow, restoreWindow } = useWindowManager();
  const [helpOpen, setHelpOpen] = useState(false);
  // `null` = no notice; otherwise the prior os string ('windows'|'chromeos'|...)
  const [migrationFromOs, setMigrationFromOs] = useState(null);

  // macOS is the only shell — tag <html> with `os-macos` so any per-os
  // CSS tweaks that target it still work. Also fire the one-time
  // migration notice for users who had a non-macOS shell selected.
  useEffect(() => {
    const root = document.documentElement;
    Array.from(root.classList).filter(c => c.startsWith('os-')).forEach(c => root.classList.remove(c));
    root.classList.add('os-macos');

    // Forced migration: read the legacy `cov-desktop-style` value once
    // and show a notice if it points to a removed shell. We always
    // overwrite to 'macos' so even if the user dismisses, they don't
    // get re-prompted on reload.
    try {
      if (!localStorage.getItem('cov-os-migrated')) {
        const prior = localStorage.getItem('cov-desktop-style');
        const removedShell = prior && prior !== 'macos' && OS_LABELS[prior];
        if (removedShell) setMigrationFromOs(prior);
        localStorage.setItem('cov-desktop-style', 'macos');
        localStorage.setItem('cov-os-migrated', '1');
      }
    } catch {}
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
      {migrationFromOs && (
        <MigrationNotice priorOs={migrationFromOs} onClose={() => setMigrationFromOs(null)} />
      )}
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
