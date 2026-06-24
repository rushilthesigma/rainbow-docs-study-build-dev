import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { syncData } from '../api/auth';

const UIPreferenceContext = createContext(null);

// ─── Accent color ─────────────────────────────────────────────────────────────
//
// The whole UI is themed off Tailwind's `blue-*` palette. Rather than rewrite
// ~90 files, we let the user pick any hue on the spectrum and rotate the blue
// scale to it at runtime. Tailwind v4 resolves every `*-blue-*` utility to
// `var(--color-blue-N)`, so overriding those custom properties on <html>
// recolors the entire interface in one shot. Inline styles on :root win over
// the @theme defaults, so this is non-destructive and reverts cleanly.

// Tailwind blue-500's OKLCH hue - the out-of-the-box accent.
export const DEFAULT_ACCENT_HUE = 259.815;

// Canonical Tailwind v4 blue ramp: [shade, L, C, hue-offset-from-500].
// We keep each step's lightness + chroma and only rotate the hue, which gives
// a perceptually even recolor across the full 50→950 scale for ANY accent
// (the browser gamut-clamps chroma per hue, so it degrades gracefully).
const BLUE_RAMP = [
  ['50',  0.970, 0.014, -5.211],
  ['100', 0.932, 0.032, -4.230],
  ['200', 0.882, 0.059, -5.687],
  ['300', 0.809, 0.105, -8.002],
  ['400', 0.707, 0.165, -5.191],
  ['500', 0.623, 0.214,  0.000],
  ['600', 0.546, 0.245,  3.066],
  ['700', 0.488, 0.243,  4.561],
  ['800', 0.424, 0.199,  5.823],
  ['900', 0.379, 0.146,  5.707],
  ['950', 0.282, 0.091,  8.120],
];

const norm360 = (n) => ((n % 360) + 360) % 360;
const resolveHue = (hue) => {
  const n = Number(hue);
  return norm360(Number.isFinite(n) ? n : DEFAULT_ACCENT_HUE);
};

const rampByShade = Object.fromEntries(BLUE_RAMP.map(([shade, l, c, dh]) => [shade, { l, c, dh }]));

export function accentColorForHue(hue, shade = '500', alpha = null) {
  const step = rampByShade[shade] || rampByShade['500'];
  const base = resolveHue(hue);
  const color = `oklch(${step.l} ${step.c} ${norm360(base + step.dh).toFixed(3)}`;
  return alpha == null ? `${color})` : `${color} / ${alpha})`;
}

// Write the rotated blue palette (plus the brand/accent aliases) onto <html>.
// Called both from the provider effect (on load / persisted change) and live
// while the user drags the spectrum, so it must be cheap and side-effect-only.
export function applyAccent(hue) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const base = resolveHue(hue);
  for (const [shade, l, c, dh] of BLUE_RAMP) {
    const color = `oklch(${l} ${c} ${norm360(base + dh).toFixed(3)})`;
    root.style.setProperty(`--color-blue-${shade}`, color);
    // `brand` is the @theme alias of the same scale (no 950 step).
    if (shade !== '950') root.style.setProperty(`--color-brand-${shade}`, color);
  }
  const accent = `oklch(0.623 0.214 ${base.toFixed(3)})`;
  root.style.setProperty('--color-accent-dark', accent);
  root.style.setProperty('--color-accent-glow-dark', `oklch(0.623 0.214 ${base.toFixed(3)} / 0.18)`);
  // Global default for the `.acc-*` helpers; per-app/mobile scopes still win.
  root.style.setProperty('--app-accent', accent);
}

export const TOOL_ACCENT_DEFAULTS = {
  canvasAccentHue: 70,
  voiceAccentHue: 330,
  humanizeAccentHue: 300,
  webSearchAccentHue: DEFAULT_ACCENT_HUE,
};

const TOOL_ACCENT_PREFIXES = {
  canvasAccentHue: 'canvas',
  voiceAccentHue: 'voice',
  humanizeAccentHue: 'humanize',
  webSearchAccentHue: 'web-search',
};

export function applyToolAccent(prefKey, hue) {
  if (typeof document === 'undefined') return;
  const prefix = TOOL_ACCENT_PREFIXES[prefKey] || prefKey;
  const root = document.documentElement;
  root.style.setProperty(`--${prefix}-accent`, accentColorForHue(hue, '500'));
  root.style.setProperty(`--${prefix}-accent-text`, accentColorForHue(hue, '300'));
  root.style.setProperty(`--${prefix}-accent-light`, accentColorForHue(hue, '300'));
  root.style.setProperty(`--${prefix}-accent-dark`, accentColorForHue(hue, '900'));
  root.style.setProperty(`--${prefix}-accent-soft`, accentColorForHue(hue, '500', 0.20));
  root.style.setProperty(`--${prefix}-accent-hover`, accentColorForHue(hue, '500', 0.12));
  root.style.setProperty(`--${prefix}-accent-ring`, accentColorForHue(hue, '400', 0.50));
  root.style.setProperty(`--${prefix}-accent-glow`, accentColorForHue(hue, '500', 0.36));
}

// Wallpapers that were removed from WALLPAPERS. If a user still has
// one of these in their stored preference, fall back to the default
// so they don't see a broken background.
const RETIRED_WALLPAPERS = new Set(['desert', 'cherry']);

// Hard defaults - used when there's no signed-in user (login screen,
// onboarding pre-auth) or when the server hasn't backfilled prefs yet.
//
// windowOpacity / titlebarOpacity are stored as opacity percentages
// where 100 = fully opaque. The "transparency %" the user sees in the
// Settings panel is `100 - opacity`, so 100 here surfaces as
// "0% transparency" - i.e. fully solid windows out of the box. Users
// who want frosted-glass chrome can still dial it down in Settings.
const DEFAULTS = {
  theme: 'dark',
  accentHue: DEFAULT_ACCENT_HUE,
  ...TOOL_ACCENT_DEFAULTS,
  wallpaper: 'milkyway',
  dockSize: 'medium',
  iconStyle: 'gradient',
  dockPosition: 'bottom',
  uiMode: 'desktop',
  // osStyle was removed - the shell is Windows 11 only now. Any legacy
  // value in `user.data.preferences.osStyle` is ignored at read time.
  windowOpacity: 100,
  titlebarOpacity: 100,
  bottomBarTransparent: true,
};

// All UI preferences are persisted server-side under
// `user.data.preferences`. localStorage is no longer used for any of
// them. The provider mirrors the server values into local state so
// changes are snappy; setX kicks off a fire-and-forget syncData with
// the merged preferences object.
//
// Pre-auth: hard defaults apply. setX is a no-op until a user is
// available - there's nowhere to persist to without a session.
export function UIPreferenceProvider({ children }) {
  const { user, fetchUser } = useAuth();
  const serverPrefs = user?.data?.preferences || {};

  // Optimistic overrides applied immediately on setX calls, before the
  // server round-trip completes. Cleared once fetchUser resolves.
  const [optimisticPrefs, setOptimisticPrefs] = useState({});

  // Merge: optimistic wins over server, server wins over defaults.
  const prefs = useMemo(() => ({ ...serverPrefs, ...optimisticPrefs }), [serverPrefs, optimisticPrefs]);

  // Drop optimistic keys once the server data catches up.
  useEffect(() => {
    if (!Object.keys(optimisticPrefs).length) return;
    setOptimisticPrefs(prev => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(prev)) {
        if (serverPrefs[key] === prev[key]) { delete next[key]; changed = true; }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPrefs]);

  // Resolve effective values - merged pref first, defaults second.
  const rawWallpaper = prefs.wallpaper || DEFAULTS.wallpaper;
  const wallpaper = RETIRED_WALLPAPERS.has(rawWallpaper) ? DEFAULTS.wallpaper : rawWallpaper;
  // Theme is locked to dark - light mode is not supported.
  const theme = 'dark';
  const accentHue    = prefs.accentHue   ?? DEFAULTS.accentHue;
  const canvasAccentHue = prefs.canvasAccentHue ?? DEFAULTS.canvasAccentHue;
  const voiceAccentHue = prefs.voiceAccentHue ?? DEFAULTS.voiceAccentHue;
  const humanizeAccentHue = prefs.humanizeAccentHue ?? DEFAULTS.humanizeAccentHue;
  const webSearchAccentHue = prefs.webSearchAccentHue ?? DEFAULTS.webSearchAccentHue;
  const dockSize     = prefs.dockSize    || DEFAULTS.dockSize;
  const iconStyle    = prefs.iconStyle   || DEFAULTS.iconStyle;
  const dockPosition    = prefs.dockPosition    || DEFAULTS.dockPosition;
  const uiMode          = prefs.uiMode          || DEFAULTS.uiMode;
  const windowOpacity           = prefs.windowOpacity           ?? DEFAULTS.windowOpacity;
  const titlebarOpacity         = prefs.titlebarOpacity         ?? DEFAULTS.titlebarOpacity;
  const bottomBarTransparent    = prefs.bottomBarTransparent    ?? DEFAULTS.bottomBarTransparent;

  // Theme is always dark - ensure the class is set on mount and stays set.
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Rotate the blue palette to the chosen accent hue. Runs on mount and
  // whenever the persisted hue changes (incl. a sync from another session).
  useEffect(() => {
    applyAccent(accentHue);
  }, [accentHue]);

  useEffect(() => {
    applyToolAccent('canvasAccentHue', canvasAccentHue);
    applyToolAccent('voiceAccentHue', voiceAccentHue);
    applyToolAccent('humanizeAccentHue', humanizeAccentHue);
    applyToolAccent('webSearchAccentHue', webSearchAccentHue);
  }, [canvasAccentHue, voiceAccentHue, humanizeAccentHue, webSearchAccentHue]);

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
  // sequence of setX calls (theme then wallpaper, say) doesn't race -
  // each call merges into the latest snapshot, not the stale user.data.
  const latestPrefs = useRef(prefs);
  useEffect(() => { latestPrefs.current = { ...serverPrefs, ...optimisticPrefs }; }, [serverPrefs, optimisticPrefs]);

  // `user` is read through a ref so setPref keeps a stable identity across
  // fetchUser calls (which replace the user object after many in-app
  // actions). A stable setPref keeps every setX below stable, which keeps
  // the memoized context value below stable - so a user refetch with
  // unchanged preferences re-renders ZERO windows. Without this, every
  // fetchUser re-rendered all open windows simultaneously (context
  // subscriptions bypass Window's React.memo), repainting N compositor
  // layers in one frame - a multi-window wallpaper-flash trigger.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const setPref = useCallback(async (key, value) => {
    if (!userRef.current) return;
    // Apply immediately so the UI reacts without waiting for the server.
    setOptimisticPrefs(prev => ({ ...prev, [key]: value }));
    const next = { ...latestPrefs.current, [key]: value };
    latestPrefs.current = next;
    try {
      await syncData({ preferences: next });
      await fetchUser();
    } catch (err) {
      console.error('Failed to sync preferences:', err);
    }
  }, [fetchUser]);

  // setTheme is a no-op - dark mode is permanent.
  // eslint-disable-next-line no-unused-vars
  const setTheme = useCallback((_v) => {}, []);
  const setAccentHue    = useCallback((v) => setPref('accentHue', v),    [setPref]);
  const setCanvasAccentHue = useCallback((v) => setPref('canvasAccentHue', v), [setPref]);
  const setVoiceAccentHue = useCallback((v) => setPref('voiceAccentHue', v), [setPref]);
  const setHumanizeAccentHue = useCallback((v) => setPref('humanizeAccentHue', v), [setPref]);
  const setWebSearchAccentHue = useCallback((v) => setPref('webSearchAccentHue', v), [setPref]);
  const previewCanvasAccent = useCallback((v) => applyToolAccent('canvasAccentHue', v), []);
  const previewVoiceAccent = useCallback((v) => applyToolAccent('voiceAccentHue', v), []);
  const previewHumanizeAccent = useCallback((v) => applyToolAccent('humanizeAccentHue', v), []);
  const previewWebSearchAccent = useCallback((v) => applyToolAccent('webSearchAccentHue', v), []);
  const setWallpaper    = useCallback((v) => setPref('wallpaper', v),    [setPref]);
  const setDockSize     = useCallback((v) => setPref('dockSize', v),     [setPref]);
  const setIconStyle    = useCallback((v) => setPref('iconStyle', v),    [setPref]);
  const setDockPosition    = useCallback((v) => setPref('dockPosition', v),    [setPref]);
  const setUiMode          = useCallback((v) => setPref('uiMode', v),          [setPref]);
  const setWindowOpacity           = useCallback((v) => setPref('windowOpacity', v),           [setPref]);
  const setTitlebarOpacity         = useCallback((v) => setPref('titlebarOpacity', v),         [setPref]);
  const setBottomBarTransparent    = useCallback((v) => setPref('bottomBarTransparent', v),    [setPref]);

  // Mobile mode is inferred from viewport, not persisted - narrow
  // viewports always get the mobile shell regardless of user pref.
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveMode = isMobile ? 'classic' : uiMode;

  // Memoized so the context value only changes when a resolved preference
  // actually changes. The provider re-renders whenever AuthContext does
  // (every fetchUser produces a new user object); an inline value object
  // here would re-render every consumer - including ALL open windows,
  // since context subscriptions bypass Window's React.memo - on each of
  // those renders. All setters are stable, so the deps are just the
  // resolved values.
  const value = useMemo(() => ({
    uiMode: effectiveMode, rawUiMode: uiMode, setUiMode,
    wallpaper, setWallpaper,
    accentHue, setAccentHue, previewAccent: applyAccent,
    canvasAccentHue, setCanvasAccentHue, previewCanvasAccent,
    voiceAccentHue, setVoiceAccentHue, previewVoiceAccent,
    humanizeAccentHue, setHumanizeAccentHue, previewHumanizeAccent,
    webSearchAccentHue, setWebSearchAccentHue, previewWebSearchAccent,
    dockSize, setDockSize,
    iconStyle, setIconStyle,
    dockPosition, setDockPosition,
    theme, setTheme,
    windowOpacity, setWindowOpacity,
    titlebarOpacity, setTitlebarOpacity,
    bottomBarTransparent, setBottomBarTransparent,
  }), [
    effectiveMode, uiMode, wallpaper, accentHue,
    canvasAccentHue, voiceAccentHue, humanizeAccentHue, webSearchAccentHue,
    dockSize, iconStyle, dockPosition,
    theme, windowOpacity, titlebarOpacity, bottomBarTransparent,
    setUiMode, setWallpaper, setAccentHue,
    setCanvasAccentHue, setVoiceAccentHue, setHumanizeAccentHue, setWebSearchAccentHue,
    previewCanvasAccent, previewVoiceAccent, previewHumanizeAccent, previewWebSearchAccent,
    setDockSize, setIconStyle, setDockPosition,
    setTheme, setWindowOpacity, setTitlebarOpacity, setBottomBarTransparent,
  ]);

  return (
    <UIPreferenceContext.Provider value={value}>
      {children}
    </UIPreferenceContext.Provider>
  );
}

export function useUIPreference() {
  const ctx = useContext(UIPreferenceContext);
  if (!ctx) throw new Error('useUIPreference must be inside UIPreferenceProvider');
  return ctx;
}
