import { create } from 'zustand';
import { World } from '@/lib/physics2d/world';
import type { Body } from '@/lib/physics2d/types';
import { buildDemo, type DemoId } from '@/lib/physics2d/demos';

export type Tool =
  | 'select'
  | 'circle'
  | 'box'
  | 'triangle'
  | 'pentagon'
  | 'hexagon'
  | 'rope'
  | 'spring'
  | 'pin'
  | 'eraser';

export interface DebugFlags {
  velocity: boolean;
  forces: boolean;
  aabb: boolean;
  contacts: boolean;
  sleep: boolean;
}

interface PhysicsBenchStore {
  world: World;
  running: boolean;
  timeScale: number;
  tool: Tool;
  selectedId: string | null;
  debug: DebugFlags;
  /** Material id selected in the toolbar — applied to bodies spawned next. */
  currentMaterial: string;
  /** Increments when world structure changes (so UI re-renders) */
  rev: number;

  setRunning: (b: boolean) => void;
  toggleRunning: () => void;
  setTimeScale: (s: number) => void;
  setTool: (t: Tool) => void;
  setSelected: (id: string | null) => void;
  setDebug: (k: keyof DebugFlags, v: boolean) => void;
  setMaterial: (id: string) => void;

  /** Replace the world from a fresh demo */
  loadDemo: (id: DemoId) => void;

  /** Apply a function to the world, then bump rev */
  mutate: (fn: (w: World) => void) => void;

  setGravity: (x: number, y: number) => void;
  setIterations: (n: number) => void;

  step: (dt: number) => void;
}

export const usePhysicsBenchStore = create<PhysicsBenchStore>((set, get) => ({
  world: buildDemo('empty'),
  running: true,
  timeScale: 1,
  tool: 'select',
  selectedId: null,
  debug: { velocity: false, forces: false, aabb: false, contacts: false, sleep: true },
  currentMaterial: 'plastic',
  rev: 0,

  setRunning: (b) => set({ running: b }),
  toggleRunning: () => set((s) => ({ running: !s.running })),
  setTimeScale: (s) => set({ timeScale: s }),
  setTool: (t) => set({ tool: t }),
  setSelected: (id) => set({ selectedId: id }),
  setDebug: (k, v) => set((s) => ({ debug: { ...s.debug, [k]: v } })),
  setMaterial: (id) => set({ currentMaterial: id }),

  loadDemo: (id) => {
    set({ world: buildDemo(id), selectedId: null, rev: get().rev + 1 });
  },

  mutate: (fn) => {
    fn(get().world);
    set({ rev: get().rev + 1 });
  },

  setGravity: (x, y) => {
    const w = get().world;
    w.gravity = { x, y };
    set({ rev: get().rev + 1 });
  },
  setIterations: (n) => {
    const w = get().world;
    w.iterations = Math.max(1, Math.min(40, n));
    set({ rev: get().rev + 1 });
  },

  step: (dt) => {
    const { world, running, timeScale } = get();
    if (!running) return;
    world.step(dt * timeScale);
  },
}));

export function findBodyAt(world: World, wx: number, wy: number): Body | null {
  // Iterate in reverse — last-rendered (top) wins
  for (let i = world.bodies.length - 1; i >= 0; i--) {
    const b = world.bodies[i];
    if (b.shape.kind === 'circle') {
      const dx = wx - b.pos.x;
      const dy = wy - b.pos.y;
      if (dx * dx + dy * dy <= b.shape.radius * b.shape.radius) return b;
    } else {
      // Point-in-convex-polygon (in body local space)
      const c = Math.cos(-b.angle);
      const s = Math.sin(-b.angle);
      const lx = (wx - b.pos.x) * c - (wy - b.pos.y) * s;
      const ly = (wx - b.pos.x) * s + (wy - b.pos.y) * c;
      let inside = true;
      const verts = b.shape.vertices;
      for (let j = 0; j < verts.length; j++) {
        const a = verts[j];
        const bp = verts[(j + 1) % verts.length];
        const cross = (bp.x - a.x) * (ly - a.y) - (bp.y - a.y) * (lx - a.x);
        if (cross < 0) {
          inside = false;
          break;
        }
      }
      if (inside) return b;
    }
  }
  return null;
}
