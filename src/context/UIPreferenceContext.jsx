import { createContext, useContext, useState, useEffect } from 'react';

const UIPreferenceContext = createContext(null);

function loadPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

export function UIPreferenceProvider({ children }) {
  const [uiMode, setUiModeState] = useState('desktop');
  const [wallpaper, setWallpaperState] = useState(() => loadPref('covalent-wallpaper', 'lavender'));
  const [dockSize, setDockSizeState] = useState(() => loadPref('covalent-dock-size', 'medium'));
  const [iconStyle, setIconStyleState] = useState(() => loadPref('covalent-icon-style', 'gradient'));
  const [dockPosition, setDockPositionState] = useState(() => loadPref('covalent-dock-position', 'bottom'));
  const [theme, setThemeState] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  function setTheme(t) {
    setThemeState(t);
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('covalent-theme', t);
  }

  function setUiMode(mode) {
    setUiModeState(mode);
    localStorage.setItem('covalent-ui-mode', mode);
  }
  function setWallpaper(wp) {
    setWallpaperState(wp);
    localStorage.setItem('covalent-wallpaper', wp);
  }
  function setDockSize(s) {
    setDockSizeState(s);
    localStorage.setItem('covalent-dock-size', s);
  }
  function setIconStyle(s) {
    setIconStyleState(s);
    localStorage.setItem('covalent-icon-style', s);
  }
  function setDockPosition(p) {
    setDockPositionState(p);
    localStorage.setItem('covalent-dock-position', p);
  }

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const effectiveMode = isMobile ? 'classic' : uiMode;

  return (
    <UIPreferenceContext.Provider value={{
      uiMode: effectiveMode, rawUiMode: uiMode, setUiMode,
      wallpaper, setWallpaper,
      dockSize, setDockSize,
      iconStyle, setIconStyle,
      dockPosition, setDockPosition,
      theme, setTheme,
    }}>
      {children}
    </UIPreferenceContext.Provider>
  );
}

export function useUIPreference() {
  const ctx = useContext(UIPreferenceContext);
  if (!ctx) throw new Error('useUIPreference must be inside UIPreferenceProvider');
  return ctx;
}
