import { create } from 'zustand';
import type { AppId, WindowState } from '@/os/types';

let nextId = 1;
const newId = () => `win-${nextId++}`;

interface WindowStore {
  windows: WindowState[];
  focusedId: string | null;
  topZ: number;
  launchingApps: Set<AppId>;

  openApp: (
    appId: AppId,
    opts?: {
      title?: string;
      width?: number;
      height?: number;
      x?: number;
      y?: number;
    },
  ) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string, viewport: { w: number; h: number }) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  setLaunching: (appId: AppId, launching: boolean) => void;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],
  focusedId: null,
  topZ: 10,
  launchingApps: new Set(),

  openApp: (appId, opts = {}) => {
    const id = newId();
    const { topZ, windows } = get();
    const z = topZ + 1;
    const width = opts.width ?? 760;
    const height = opts.height ?? 520;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    // Cascade windows slightly so multiple of same app don't overlap exactly
    const offset = windows.length * 28;
    const x =
      opts.x ??
      Math.max(40, Math.min(viewportW - width - 40, (viewportW - width) / 2 + offset));
    const y =
      opts.y ??
      Math.max(48, Math.min(viewportH - height - 100, (viewportH - height) / 2 + offset));

    const win: WindowState = {
      id,
      appId,
      title: opts.title ?? appId,
      x,
      y,
      width,
      height,
      zIndex: z,
      minimized: false,
      maximized: false,
    };
    set({
      windows: [...windows, win],
      focusedId: id,
      topZ: z,
    });
    return id;
  },

  closeWindow: (id) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.id !== id),
      focusedId:
        s.focusedId === id
          ? [...s.windows].filter((w) => w.id !== id).sort((a, b) => b.zIndex - a.zIndex)[0]
              ?.id ?? null
          : s.focusedId,
    })),

  focusWindow: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      return {
        topZ: z,
        focusedId: id,
        windows: s.windows.map((w) =>
          w.id === id ? { ...w, zIndex: z, minimized: false } : w,
        ),
      };
    }),

  minimizeWindow: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
      focusedId:
        s.focusedId === id
          ? [...s.windows]
              .filter((w) => w.id !== id && !w.minimized)
              .sort((a, b) => b.zIndex - a.zIndex)[0]?.id ?? null
          : s.focusedId,
    })),

  restoreWindow: (id) => {
    const { focusWindow } = get();
    focusWindow(id);
  },

  toggleMaximize: (id, viewport) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized && w.prevBounds) {
          return {
            ...w,
            maximized: false,
            x: w.prevBounds.x,
            y: w.prevBounds.y,
            width: w.prevBounds.width,
            height: w.prevBounds.height,
            prevBounds: undefined,
          };
        }
        return {
          ...w,
          maximized: true,
          prevBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
          x: 0,
          y: 32, // below menu bar
          width: viewport.w,
          height: viewport.h - 32 - 88, // leave space for dock
        };
      }),
    })),

  moveWindow: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),

  resizeWindow: (id, bounds) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, ...bounds } : w)),
    })),

  setLaunching: (appId, launching) =>
    set((s) => {
      const next = new Set(s.launchingApps);
      if (launching) next.add(appId);
      else next.delete(appId);
      return { launchingApps: next };
    }),
}));
