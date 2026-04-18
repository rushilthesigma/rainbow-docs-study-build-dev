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

  // Tag <html> with os-<style> so per-OS CSS tweaks can target app UI without
  // every component needing to read the preference. Cleans up on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const prev = Array.from(root.classList).filter(c => c.startsWith('os-'));
    prev.forEach(c => root.classList.remove(c));
    root.classList.add(`os-${style}`);
    return () => root.classList.remove(`os-${style}`);
  }, [style]);

  switch (style) {
    case 'windows': return <WindowsShell />;
    case 'chromeos': return <ChromeOSShell />;
    case 'linux': return <LinuxShell />;
    case 'mobile': return <MobileApp />;
    default: return <MacOSContent />;
  }
}

export default function DesktopShell() {
  return (
    <WindowManagerProvider>
      <ShellContent />
    </WindowManagerProvider>
  );
}
