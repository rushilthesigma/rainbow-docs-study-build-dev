import { useState, useEffect, useCallback } from 'react';
import { WindowManagerProvider, useWindowManager } from '../../context/WindowManagerContext';
import DesktopBackground from './DesktopBackground';
import MenuBar from './MenuBar';
import Dock from './Dock';
import Window from './Window';
import AppWindow from './AppWindow';
import Spotlight from './Spotlight';
import ContextMenu from './ContextMenu';
import WindowsShell from './WindowsShell';
import ChromeOSShell from './ChromeOSShell';
import LinuxShell from './LinuxShell';
import MobileApp from '../mobile/MobileApp';
import GuidedTour from './GuidedTour';
import ShortcutsHelp from './ShortcutsHelp';

function MacOSContent() {
  const { state } = useWindowManager();
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  const toggleSpotlight = useCallback(() => setSpotlightOpen(prev => !prev), []);

  useEffect(() => {
    function handleKey(e) {
      // Cmd+K or Cmd+Shift+1 → spotlight
      const cmdish = e.metaKey || e.ctrlKey;
      const isDigit1 = e.code === 'Digit1' || e.key === '1' || e.key === '!' || e.keyCode === 49;
      if (cmdish && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggleSpotlight();
      } else if (cmdish && e.shiftKey && isDigit1) {
        e.preventDefault();
        toggleSpotlight();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleSpotlight]);

  const windows = Object.values(state.windows);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <DesktopBackground />
      <MenuBar onSpotlight={toggleSpotlight} />

      {windows.map(win => (
        <Window key={win.id} win={win} isActive={win.id === state.activeWindowId}>
          <AppWindow appId={win.appId} />
        </Window>
      ))}

      <Dock />
      <ContextMenu onSpotlight={toggleSpotlight} />
      <Spotlight open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}

function ShellContent() {
  const style = localStorage.getItem('cov-desktop-style') || 'macos';
  const { state, closeWindow, minimizeWindow, focusWindow, restoreWindow } = useWindowManager();
  const [helpOpen, setHelpOpen] = useState(false);

  // Tag <html> with os-<style> so per-OS CSS tweaks can target app UI without
  // every component needing to read the preference. Cleans up on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const prev = Array.from(root.classList).filter(c => c.startsWith('os-'));
    prev.forEach(c => root.classList.remove(c));
    root.classList.add(`os-${style}`);
    return () => root.classList.remove(`os-${style}`);
  }, [style]);

  // Global keyboard shortcuts. Active across every shell (mac/windows/
  // chromeos/linux). Per-app shortcuts are in their own components.
  useEffect(() => {
    function handler(e) {
      const cmdish = e.metaKey || e.ctrlKey;
      if (!cmdish) return;
      const t = e.target;
      // Skip when the user is typing in a field (except for shortcuts that
      // explicitly need to override that — / is allowed everywhere).
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      // Cmd+/ → shortcuts help (works everywhere, even in inputs)
      if (e.key === '/' || e.key === '?') {
        e.preventDefault();
        setHelpOpen(prev => !prev);
        return;
      }

      if (inField) return;

      // Cmd+W → close active window
      if (e.key === 'w' || e.key === 'W') {
        if (state.activeWindowId) {
          e.preventDefault();
          closeWindow(state.activeWindowId);
        }
        return;
      }

      // Cmd+M → minimize active window
      if (e.key === 'm' || e.key === 'M') {
        if (state.activeWindowId) {
          e.preventDefault();
          minimizeWindow(state.activeWindowId);
        }
        return;
      }

      // Cmd+1-9 → focus the Nth visible window in dock order
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

  function shellByStyle() {
    switch (style) {
      case 'windows': return <WindowsShell />;
      case 'chromeos': return <ChromeOSShell />;
      case 'linux': return <LinuxShell />;
      case 'mobile': return <MobileApp />;
      default: return <MacOSContent />;
    }
  }

  return (
    <>
      {shellByStyle()}
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
