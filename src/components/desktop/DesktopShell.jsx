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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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
