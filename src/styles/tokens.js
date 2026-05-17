// Design tokens — the single source of truth for cross-cutting numeric
// values. Anything you'd otherwise hardcode in JSX (z-index, durations,
// breakpoints) goes here so changes ripple through the app instead of
// hiding in 100+ component files.

// Layered z-index scale. Components MUST pick a name from this map
// instead of writing `z-[####]` inline. Gaps between layers leave room
// for component-local stacking without colliding with the next tier.
//
// Layout flow (low → high):
//   content        — normal in-flow UI
//   dock           — macOS dock
//   window         — windowed apps in DesktopShell
//   menubar        — top menu bar
//   menubarMenu    — menu bar dropdowns
//   overlay        — dim/blur overlays under modals
//   modal          — standard modals
//   contextMenu    — right-click menus (must beat modals)
//   spotlight      — command palette
//   sheet          — mobile bottom sheets (above desktop chrome)
//   tour           — onboarding spotlight
//   shortcuts      — keyboard cheat sheet
//   toast          — top-level toasts
//   presentation   — fullscreen takeover (slideshow)
export const Z = {
  content: 10,
  dock: 100,
  window: 200,
  menubar: 1100,
  menubarMenu: 1200,
  social: 1300,
  overlay: 1450,
  modal: 1500,
  contextMenu: 2000,
  spotlight: 2100,
  sheet: 2200,
  tour: 3000,
  shortcuts: 3200,
  toast: 3500,
  presentation: 9999,
};

// Convenience: ready-to-spread style objects to keep call sites short.
// Use as `style={zIndexStyle.modal}` when Tailwind arbitrary z-index
// can't be safelisted (e.g., dynamic class strings).
export const zIndexStyle = Object.fromEntries(
  Object.entries(Z).map(([k, v]) => [k, { zIndex: v }])
);

// Animation durations (ms). Match Tailwind's defaults where reasonable.
export const Duration = {
  instant: 75,
  fast: 150,
  base: 200,
  slow: 300,
  slower: 500,
};

// Viewport breakpoints in px. Mirrors Tailwind's defaults but exposed
// to JS so window-listener code uses the same numbers.
export const Breakpoint = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
};

// Common toast lifecycle.
export const ToastDuration = {
  short: 2500,
  base: 4000,
  long: 7000,
};
