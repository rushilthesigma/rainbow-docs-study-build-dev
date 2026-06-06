import { createContext, useContext, useReducer, useCallback } from 'react';

const WindowManagerContext = createContext(null);

const INITIAL_STATE = { windows: {}, nextZIndex: 10, activeWindowId: null, cascadeOffset: 0 };

function getDefaultSize(appId) {
  const sizes = {
    study: { w: 700, h: 550 },
    math: { w: 850, h: 600 },
    settings: { w: 600, h: 500 },
    newcurriculum: { w: 650, h: 550 },
    goals: { w: 950, h: 600 },
    // Mobile Preview: wider than a phone so it's usable on a desktop
    // monitor. The iframe inside is constrained to 375px so the mobile
    // breakpoint still fires.
    mobilepreview: { w: 500, h: 820 },
    // Widgets gallery is intentionally small + fixed - it's a picker,
    // not a workspace.
    widgets: { w: 420, h: 580 },
  };
  return sizes[appId] || { w: 800, h: 560 };
}

// Apps whose windows are locked to their default size - no resize, no
// maximize. Used for the Mobile Preview cutout (changing the dimensions
// would defeat the point of the preview) and the Widgets gallery
// (sized as a tight picker; resizing it would just create empty space).
const FIXED_SIZE_APPS = new Set(['mobilepreview', 'widgets']);
function isFixedSize(appId) { return FIXED_SIZE_APPS.has(appId); }

function getCascadePos(offset) {
  const base = { x: 80, y: 50 };
  const x = base.x + (offset % 8) * 30;
  const y = base.y + (offset % 8) * 30;
  return { x: Math.min(x, window.innerWidth - 500), y: Math.min(y, window.innerHeight - 400) };
}

// Keep an anchored spawn point on-screen - accounts for the menu bar
// (28px) at the top and a small margin at every edge so the title bar
// stays grabbable.
function clampToViewport(pos, size) {
  const PAD = 8;
  const TOP = 32;
  const maxX = window.innerWidth  - size.w - PAD;
  const maxY = window.innerHeight - size.h - PAD;
  return {
    x: Math.max(PAD, Math.min(pos.x, maxX)),
    y: Math.max(TOP, Math.min(pos.y, maxY)),
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN_WINDOW': {
      // Multi-instance: by default `openApp(id)` opens a NEW window
      // every time, so the user can have several Curricula or Study
      // windows side-by-side. The legacy "focus existing instead" path
      // is opt-in via `action.focusIfOpen` - used by the Dock so a
      // single click on an app icon doesn't spawn a duplicate when
      // the app is already running and visible.
      const focusIfOpen = !!action.focusIfOpen;
      // Mobile Preview is the one app where multiple instances make
      // no sense (it iframes the mobile site at a fixed size). Always
      // refocus its existing window if it's open.
      const oneInstanceOnly = action.appId === 'mobilepreview' || focusIfOpen;
      if (oneInstanceOnly) {
        const existing = Object.values(state.windows).find(w => w.appId === action.appId);
        if (existing) {
          return {
            ...state,
            activeWindowId: existing.id,
            windows: { ...state.windows, [existing.id]: { ...existing, isMinimized: false, zIndex: state.nextZIndex } },
            nextZIndex: state.nextZIndex + 1,
          };
        }
      }
      // Use a random suffix so two `openApp` calls in the same ms (e.g.
      // user double-clicking) each get unique ids.
      const id = `win-${action.appId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const size = getDefaultSize(action.appId);
      // Caller can pin the spawn point (e.g. the Widgets app anchors
      // itself above the + button in the dock). Otherwise fall back to
      // the diagonal cascade.
      const position = action.position
        ? clampToViewport(action.position, size)
        : getCascadePos(state.cascadeOffset);
      const fixedSize = isFixedSize(action.appId);
      // (Slides used to force-open maximized; that app is gone now so
      // every window opens at its cascade position.)
      const openMaximized = false;
      return {
        ...state,
        windows: {
          ...state.windows,
          [id]: { id, appId: action.appId, title: action.title || action.appId, meta: action.meta || {}, position, size, zIndex: state.nextZIndex, isMinimized: false, isMaximized: openMaximized, isClosing: false, preMaximize: openMaximized ? { position, size } : null, fixedSize },
        },
        nextZIndex: state.nextZIndex + 1,
        activeWindowId: id,
        cascadeOffset: state.cascadeOffset + 1,
      };
    }
    case 'CLOSE_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      return { ...state, windows: { ...state.windows, [action.windowId]: { ...w, isClosing: true } } };
    }
    case 'REMOVE_WINDOW': {
      const { [action.windowId]: _, ...rest } = state.windows;
      const newActive = state.activeWindowId === action.windowId ? (Object.keys(rest).pop() || null) : state.activeWindowId;
      return { ...state, windows: rest, activeWindowId: newActive };
    }
    case 'MINIMIZE_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      // If the minimized window was active, drop focus so taskbar / dock don't
      // keep highlighting it. Pick the highest-zIndex non-minimized window as
      // the new active, or null if none.
      let nextActive = state.activeWindowId;
      if (state.activeWindowId === action.windowId) {
        const candidates = Object.values(state.windows)
          .filter(x => x.id !== action.windowId && !x.isMinimized && !x.isClosing)
          .sort((a, b) => b.zIndex - a.zIndex);
        nextActive = candidates[0]?.id || null;
      }
      return {
        ...state,
        activeWindowId: nextActive,
        windows: { ...state.windows, [action.windowId]: { ...w, isMinimized: true } },
      };
    }
    case 'RESTORE_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      return {
        ...state,
        activeWindowId: action.windowId,
        windows: { ...state.windows, [action.windowId]: { ...w, isMinimized: false, zIndex: state.nextZIndex } },
        nextZIndex: state.nextZIndex + 1,
      };
    }
    case 'MAXIMIZE_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      // Fixed-size apps (Mobile Preview) ignore zoom - the dimensions
      // are the whole point of the app.
      if (w.fixedSize) return state;
      if (w.isMaximized) {
        return { ...state, windows: { ...state.windows, [action.windowId]: { ...w, isMaximized: false, position: w.preMaximize?.position || w.position, size: w.preMaximize?.size || w.size, preMaximize: null } } };
      }
      return { ...state, windows: { ...state.windows, [action.windowId]: { ...w, isMaximized: true, preMaximize: { position: w.position, size: w.size } } } };
    }
    case 'FOCUS_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      return { ...state, activeWindowId: action.windowId, windows: { ...state.windows, [action.windowId]: { ...w, zIndex: state.nextZIndex } }, nextZIndex: state.nextZIndex + 1 };
    }
    case 'MOVE_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      return { ...state, windows: { ...state.windows, [action.windowId]: { ...w, position: action.position } } };
    }
    case 'RESIZE_WINDOW': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      // Fixed-size apps reject any resize attempt.
      if (w.fixedSize) return state;
      return { ...state, windows: { ...state.windows, [action.windowId]: { ...w, size: action.size, ...(action.position ? { position: action.position } : {}) } } };
    }
    case 'SET_TITLE': {
      const w = state.windows[action.windowId];
      if (!w) return state;
      return { ...state, windows: { ...state.windows, [action.windowId]: { ...w, title: action.title } } };
    }
    case 'SPLIT_WINDOWS': {
      const { leftId, rightId } = action;
      const left = state.windows[leftId];
      const right = state.windows[rightId];
      if (!left || !right) return state;
      const halfW = Math.floor(window.innerWidth / 2);
      const h = window.innerHeight - 28 - 72;
      return {
        ...state,
        windows: {
          ...state.windows,
          [leftId]: { ...left, position: { x: 0, y: 28 }, size: { w: halfW, h }, isMaximized: false, isMinimized: false, preMaximize: { position: left.position, size: left.size }, zIndex: state.nextZIndex },
          [rightId]: { ...right, position: { x: halfW, y: 28 }, size: { w: halfW, h }, isMaximized: false, isMinimized: false, preMaximize: { position: right.position, size: right.size }, zIndex: state.nextZIndex + 1 },
        },
        nextZIndex: state.nextZIndex + 2,
        activeWindowId: rightId,
      };
    }
    default: return state;
  }
}

export function WindowManagerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Default: spawn a fresh window (multi-instance). Pass
  // `focusIfOpen=true` (3rd arg) when you want the legacy "single
  // instance per app" behaviour - used by the Dock click handler so
  // the user can refocus a running app without spawning duplicates.
  // metaOrFocus: pass `true` for single-instance focus-if-open (Dock),
  // or pass an object `{ initialMessage, ... }` to seed the app with data.
  const openApp = useCallback((appId, title, metaOrFocus = false) => {
    // Legacy shape: third arg is `true` for single-instance focus-if-open.
    // New shape: third arg is an object - supports `meta.focusIfOpen` AND
    // `meta.position` for spawn-point pinning (e.g. the dock's +
    // button placing the Widgets app directly above itself).
    const isObj = metaOrFocus && typeof metaOrFocus === 'object';
    const focusIfOpen = isObj ? !!metaOrFocus.focusIfOpen : metaOrFocus === true;
    const meta = isObj ? metaOrFocus : {};
    const position = meta.position || null;
    dispatch({ type: 'OPEN_WINDOW', appId, title, focusIfOpen, meta, position });
  }, []);
  const closeWindow = useCallback((windowId) => dispatch({ type: 'CLOSE_WINDOW', windowId }), []);
  const removeWindow = useCallback((windowId) => dispatch({ type: 'REMOVE_WINDOW', windowId }), []);
  const minimizeWindow = useCallback((windowId) => dispatch({ type: 'MINIMIZE_WINDOW', windowId }), []);
  const restoreWindow = useCallback((windowId) => dispatch({ type: 'RESTORE_WINDOW', windowId }), []);
  const maximizeWindow = useCallback((windowId) => dispatch({ type: 'MAXIMIZE_WINDOW', windowId }), []);
  const focusWindow = useCallback((windowId) => dispatch({ type: 'FOCUS_WINDOW', windowId }), []);
  const moveWindow = useCallback((windowId, position) => dispatch({ type: 'MOVE_WINDOW', windowId, position }), []);
  const resizeWindow = useCallback((windowId, size, position) => dispatch({ type: 'RESIZE_WINDOW', windowId, size, position }), []);
  const splitWindows = useCallback((leftId, rightId) => dispatch({ type: 'SPLIT_WINDOWS', leftId, rightId }), []);

  return (
    <WindowManagerContext.Provider value={{ state, dispatch, openApp, closeWindow, removeWindow, minimizeWindow, restoreWindow, maximizeWindow, focusWindow, moveWindow, resizeWindow, splitWindows }}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error('useWindowManager must be inside WindowManagerProvider');
  return ctx;
}

// Like useWindowManager but returns null instead of throwing when used
// outside the provider - for shared components that work in both the
// desktop shell (windowed) and the mobile/classic shells (router-based).
export function useWindowManagerOptional() {
  return useContext(WindowManagerContext);
}
