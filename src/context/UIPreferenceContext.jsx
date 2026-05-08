import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { syncData } from '../api/auth';

const UIPreferenceContext = createContext(null);

// Wallpapers that were removed from WALLPAPERS. If a user still has
// one of these in their stored preference, fall back to the default
// so they don't see a broken background.
const RETIRED_WALLPAPERS = new Set(['desert', 'cherry']);

// Hard defaults — used when there's no signed-in user (login screen,
// onboarding pre-auth) or when the server hasn't backfilled prefs yet.
const DEFAULTS = {
  theme: 'dark',
  wallpaper: 'lavender',
  dockSize: 'medium',
  iconStyle: 'gradient',
  dockPosition: 'bottom',
  uiMode: 'desktop',
  windowOpacity: 55,
  titlebarOpacity: 80,
};

// All UI preferences are persisted server-side under
// `user.data.preferences`. localStorage is no longer used for any of
// them. The provider mirrors the server values into local state so
// changes are snappy; setX kicks off a fire-and-forget syncData with
// the merged preferences object.
//
// Pre-auth: hard defaults apply. setX is a no-op until a user is
// available — there's nowhere to persist to without a session.
export function UIPreferenceProvider({ children }) {
  const { user, fetchUser } = useAuth();
  const prefs = user?.data?.preferences || {};

  // Resolve effective values — server pref first, defaults second.
  const rawWallpaper = prefs.wallpaper || DEFAULTS.wallpaper;
  const wallpaper = RETIRED_WALLPAPERS.has(rawWallpaper) ? DEFAULTS.wallpaper : rawWallpaper;
  const theme        = prefs.theme       || DEFAULTS.theme;
  const dockSize     = prefs.dockSize    || DEFAULTS.dockSize;
  const iconStyle    = prefs.iconStyle   || DEFAULTS.iconStyle;
  const dockPosition    = prefs.dockPosition    || DEFAULTS.dockPosition;
  const uiMode          = prefs.uiMode          || DEFAULTS.uiMode;
  const windowOpacity       = prefs.windowOpacity       ?? DEFAULTS.windowOpacity;
  const titlebarOpacity     = prefs.titlebarOpacity     ?? DEFAULTS.titlebarOpacity;

  // Apply theme to <html> whenever it changes — covers initial render
  // (server-side load), subsequent setTheme calls, and post-fetchUser
  // refreshes after sign-in.
  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // ----- Mutator -----
  //
  // For signed-in users: optimistically write the new pref, fire
  // syncData, then refetch the user so other consumers (Settings page,
  // dashboard etc.) see the update.
  //
  // For signed-out users: noop. The login screen / pre-auth chrome use
  // the hard defaults and don't need persistence.
  //
  // We track the most recent prefs locally in a ref so a rapid
  // sequence of setX calls (theme then wallpaper, say) doesn't race —
  // each call merges into the latest snapshot, not the stale user.data.
  const latestPrefs = useRef(prefs);
  useEffect(() => { latestPrefs.current = user?.data?.preferences || {}; }, [user]);

  const setPref = useCallback(async (key, value) => {
    if (!user) return;
    const next = { ...latestPrefs.current, [key]: value };
    latestPrefs.current = next;
    try {
      await syncData({ preferences: next });
      await fetchUser();
    } catch (err) {
      // Soft-fail — the local optimistic update is already applied to
      // the ref but the server didn't accept. Worth surfacing later.
      console.error('Failed to sync preferences:', err);
    }
  }, [user, fetchUser]);

  const setTheme        = useCallback((v) => {
    // Apply immediately for snappy feedback; server sync follows.
    if (v === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    return setPref('theme', v);
  }, [setPref]);
  const setWallpaper    = useCallback((v) => setPref('wallpaper', v),    [setPref]);
  const setDockSize     = useCallback((v) => setPref('dockSize', v),     [setPref]);
  const setIconStyle    = useCallback((v) => setPref('iconStyle', v),    [setPref]);
  const setDockPosition    = useCallback((v) => setPref('dockPosition', v),    [setPref]);
  const setUiMode          = useCallback((v) => setPref('uiMode', v),          [setPref]);
  const setWindowOpacity       = useCallback((v) => setPref('windowOpacity', v),       [setPref]);
  const setTitlebarOpacity     = useCallback((v) => setPref('titlebarOpacity', v),     [setPref]);

  // Mobile mode is inferred from viewport, not persisted — narrow
  // viewports always get the mobile shell regardless of user pref.
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
      windowOpacity, setWindowOpacity,
      titlebarOpacity, setTitlebarOpacity,
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
