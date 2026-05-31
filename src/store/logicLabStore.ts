import { create } from 'zustand';
import type { Bit, Circuit, Component, Connection, GateType } from '@/lib/logicsim/types';
import { pinId } from '@/lib/logicsim/types';
import { SPECS } from '@/lib/logicsim/gates';
import {
  advanceClocks,
  buildSim,
  findConflictingConnection,
  step,
  pinExists,
  type SimState,
} from '@/lib/logicsim/simulator';

let seq = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface LogicLabState {
  components: Component[];
  connections: Connection[];
  selectedId: string | null;
  /** Pin selected for "wiring mode" - null when not wiring */
  wiringFrom: string | null;
  /** Wire that hasn't landed yet - UI cursor position */
  wireCursor: { x: number; y: number } | null;

  running: boolean;
  speed: number; // simulation Hz multiplier
  oscillating: Set<string>;
  oscillatingConnections: Set<string>;
  pinValues: Map<string, Bit>;
  viewport: Viewport;

  /** Generation counter; lets React components re-render efficiently */
  rev: number;

  /* actions */
  addComponent: (type: GateType, x: number, y: number) => string;
  removeComponent: (id: string) => void;
  moveComponent: (id: string, x: number, y: number) => void;
  setSelected: (id: string | null) => void;
  updateState: (id: string, patch: Record<string, unknown>) => void;

  beginWire: (fromPinId: string) => void;
  cancelWire: () => void;
  setWireCursor: (p: { x: number; y: number } | null) => void;
  completeWire: (toPinId: string) => Connection | null;
  removeConnection: (id: string) => void;

  setViewport: (v: Partial<Viewport>) => void;

  setRunning: (b: boolean) => void;
  setSpeed: (n: number) => void;
  toggleInput: (id: string) => void;

  /** Advance the simulation by dt seconds (called from a tick loop) */
  tick: (dt: number) => void;
  resettle: () => void;

  newCircuit: () => void;
  serialize: () => Circuit;
  load: (c: Circuit) => void;
}

const initialPinValues = new Map<string, Bit>();

export const useLogicLabStore = create<LogicLabState>((set, get) => {
  // Sim is mutable, kept outside of React state to avoid per-frame copies.
  let sim: SimState = {
    pinValues: initialPinValues,
    oscillating: new Set(),
    oscillatingConnections: new Set(),
    outAdj: new Map(),
    inAdj: new Map(),
  };

  const rebuildSim = () => {
    sim = buildSim({
      components: get().components,
      connections: get().connections,
    });
    step(
      { components: get().components, connections: get().connections },
      sim,
    );
    set({
      pinValues: new Map(sim.pinValues),
      oscillating: new Set(sim.oscillating),
      oscillatingConnections: new Set(sim.oscillatingConnections),
      rev: get().rev + 1,
    });
  };

  return {
    components: [],
    connections: [],
    selectedId: null,
    wiringFrom: null,
    wireCursor: null,
    running: true,
    speed: 1,
    oscillating: new Set(),
    oscillatingConnections: new Set(),
    pinValues: initialPinValues,
    viewport: { x: 0, y: 0, zoom: 1 },
    rev: 0,

    addComponent: (type, x, y) => {
      const id = uid(type);
      const spec = SPECS[type];
      const comp: Component = {
        id,
        type,
        x: Math.round(x / 20) * 20,
        y: Math.round(y / 20) * 20,
        state: { ...(spec.defaultState ?? {}) },
      };
      set((s) => ({ components: [...s.components, comp], selectedId: id }));
      rebuildSim();
      return id;
    },

    removeComponent: (id) => {
      set((s) => ({
        components: s.components.filter((c) => c.id !== id),
        connections: s.connections.filter(
          (c) => !c.from.startsWith(id + ':') && !c.to.startsWith(id + ':'),
        ),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
      rebuildSim();
    },

    moveComponent: (id, x, y) => {
      set((s) => ({
        components: s.components.map((c) =>
          c.id === id ? { ...c, x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20 } : c,
        ),
        rev: s.rev + 1,
      }));
    },

    setSelected: (id) => set({ selectedId: id }),

    updateState: (id, patch) => {
      set((s) => ({
        components: s.components.map((c) =>
          c.id === id ? { ...c, state: { ...c.state, ...patch } } : c,
        ),
      }));
      rebuildSim();
    },

    beginWire: (fromPinId) => set({ wiringFrom: fromPinId }),
    cancelWire: () => set({ wiringFrom: null, wireCursor: null }),
    setWireCursor: (p) => set({ wireCursor: p }),

    completeWire: (toPinId) => {
      const { wiringFrom, components, connections } = get();
      if (!wiringFrom) return null;
      // Validate from/to kinds
      if (!pinExists(components, wiringFrom, 'out')) {
        set({ wiringFrom: null, wireCursor: null });
        return null;
      }
      if (!pinExists(components, toPinId, 'in')) {
        set({ wiringFrom: null, wireCursor: null });
        return null;
      }
      const existing = findConflictingConnection(connections, toPinId);
      let newConnections = connections;
      if (existing) {
        newConnections = newConnections.filter((c) => c.id !== existing.id);
      }
      const conn: Connection = {
        id: uid('wire'),
        from: wiringFrom,
        to: toPinId,
      };
      set({
        connections: [...newConnections, conn],
        wiringFrom: null,
        wireCursor: null,
      });
      rebuildSim();
      return conn;
    },

    removeConnection: (id) => {
      set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }));
      rebuildSim();
    },

    setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),

    setRunning: (b) => set({ running: b }),
    setSpeed: (n) => set({ speed: n }),

    toggleInput: (id) => {
      const { components } = get();
      const c = components.find((x) => x.id === id);
      if (!c || c.type !== 'input') return;
      get().updateState(id, { value: c.state.value === 1 ? 0 : 1 });
    },

    tick: (dt) => {
      const { components, connections, speed } = get();
      const circuit = { components, connections };
      const clockChanged = advanceClocks(circuit, dt * speed);
      const { changed } = step(circuit, sim, clockChanged.size ? clockChanged : undefined);
      if (changed || clockChanged.size) {
        set({
          pinValues: new Map(sim.pinValues),
          oscillating: new Set(sim.oscillating),
          oscillatingConnections: new Set(sim.oscillatingConnections),
          rev: get().rev + 1,
        });
      }
    },

    resettle: () => rebuildSim(),

    newCircuit: () => {
      set({
        components: [],
        connections: [],
        selectedId: null,
        wiringFrom: null,
        wireCursor: null,
      });
      rebuildSim();
    },

    serialize: () => ({
      components: get().components,
      connections: get().connections,
      viewport: get().viewport,
    }),

    load: (c) => {
      set({
        components: c.components,
        connections: c.connections,
        viewport: c.viewport ?? { x: 0, y: 0, zoom: 1 },
        selectedId: null,
        wiringFrom: null,
        wireCursor: null,
      });
      rebuildSim();
    },
  };
});

// Helpers
export function getPinAbsolutePosition(component: Component, pinName: string): { x: number; y: number } {
  const spec = SPECS[component.type];
  const p = spec.pins.find((q) => q.name === pinName);
  if (!p) return { x: component.x, y: component.y };
  return { x: component.x + p.x, y: component.y + p.y };
}

export { pinId };
