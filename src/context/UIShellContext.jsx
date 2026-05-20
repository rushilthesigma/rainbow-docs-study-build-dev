import { createContext, useContext, useState, useCallback } from 'react';

// Ephemeral shell state — boot animation flag + power state (on / sleep /
// off). These don't sync to the server like UIPreference does; they're
// pure session UI state. The DesktopShell mounts a BootScreen while
// `booted === false`, and PowerOverlay handles `power !== 'on'`.

const UIShellContext = createContext(null);

export function UIShellProvider({ children }) {
  const [booted, setBootedRaw] = useState(false);
  const [power, setPowerRaw] = useState('on');

  const setBooted = useCallback((b) => setBootedRaw(b), []);
  const setPower = useCallback((p) => setPowerRaw(p), []);

  return (
    <UIShellContext.Provider value={{ booted, setBooted, power, setPower }}>
      {children}
    </UIShellContext.Provider>
  );
}

export function useUIShell() {
  const ctx = useContext(UIShellContext);
  if (!ctx) throw new Error('useUIShell must be inside UIShellProvider');
  return ctx;
}
