import { create } from 'zustand';
import { solveTruss, type FeaModel, type FeaResult } from '@/lib/fea/truss';
import { FEA_PRESETS } from '@/lib/fea/presets';
import { getEngMaterial } from '@/lib/materials/engineering';

let seq = 1;
const uid = (p: string) => `${p}${seq++}`;

export type FeaTool = 'select' | 'node' | 'element' | 'support' | 'load';

interface FeaStore {
  model: FeaModel;
  tool: FeaTool;
  selectedNode: string | null;
  /** element-draw anchor */
  elementFrom: string | null;
  result: FeaResult | null;
  showDeformed: boolean;
  dispScale: number;
  E: number;
  area: number;
  rev: number;

  setTool: (t: FeaTool) => void;
  addNode: (x: number, y: number) => string;
  moveNode: (id: string, x: number, y: number) => void;
  toggleSupport: (id: string) => void;
  setLoad: (id: string, fx: number, fy: number) => void;
  beginElement: (id: string) => void;
  finishElement: (id: string) => void;
  removeNode: (id: string) => void;
  select: (id: string | null) => void;
  setShowDeformed: (b: boolean) => void;
  setDispScale: (n: number) => void;
  setE: (e: number) => void;
  setArea: (a: number) => void;
  materialId: string;
  yieldStress: number;
  setMaterial: (id: string) => void;
  loadPreset: (id: string) => void;
  clear: () => void;
  solve: () => FeaResult;
}

export const useFeaStore = create<FeaStore>((set, get) => ({
  model: FEA_PRESETS[0].model,
  tool: 'select',
  selectedNode: null,
  elementFrom: null,
  result: null,
  showDeformed: true,
  dispScale: 200,
  E: 2.0e11,
  area: 1e-4,
  materialId: 'steel-mild',
  yieldStress: 250e6,
  rev: 0,

  setTool: (t) => set({ tool: t, elementFrom: null }),

  addNode: (x, y) => {
    const id = uid('n');
    set((s) => ({
      model: {
        ...s.model,
        nodes: [...s.model.nodes, { id, x, y, fixX: false, fixY: false }],
      },
      rev: s.rev + 1,
    }));
    return id;
  },

  moveNode: (id, x, y) =>
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
      },
      rev: s.rev + 1,
    })),

  toggleSupport: (id) =>
    set((s) => ({
      model: {
        ...s.model,
        nodes: s.model.nodes.map((n) =>
          n.id === id
            ? n.fixX && n.fixY
              ? { ...n, fixX: false, fixY: false }
              : { ...n, fixX: true, fixY: true }
            : n,
        ),
      },
      result: null,
      rev: s.rev + 1,
    })),

  setLoad: (id, fx, fy) =>
    set((s) => {
      const loads = s.model.loads.filter((l) => l.node !== id);
      if (fx !== 0 || fy !== 0) loads.push({ node: id, fx, fy });
      return { model: { ...s.model, loads }, result: null, rev: s.rev + 1 };
    }),

  beginElement: (id) => set({ elementFrom: id }),
  finishElement: (id) => {
    const from = get().elementFrom;
    if (!from || from === id) {
      set({ elementFrom: null });
      return;
    }
    const exists = get().model.elements.some(
      (e) => (e.a === from && e.b === id) || (e.a === id && e.b === from),
    );
    if (!exists) {
      set((s) => ({
        model: {
          ...s.model,
          elements: [
            ...s.model.elements,
            { id: uid('e'), a: from, b: id, E: s.E, A: s.area },
          ],
        },
        rev: s.rev + 1,
      }));
    }
    set({ elementFrom: null });
  },

  removeNode: (id) =>
    set((s) => ({
      model: {
        nodes: s.model.nodes.filter((n) => n.id !== id),
        elements: s.model.elements.filter((e) => e.a !== id && e.b !== id),
        loads: s.model.loads.filter((l) => l.node !== id),
      },
      selectedNode: s.selectedNode === id ? null : s.selectedNode,
      result: null,
      rev: s.rev + 1,
    })),

  select: (id) => set({ selectedNode: id }),
  setShowDeformed: (b) => set({ showDeformed: b }),
  setDispScale: (n) => set({ dispScale: Math.max(1, Math.min(1e7, n)) }),
  setE: (e) => set({ E: e }),
  setArea: (a) => set({ area: a }),
  setMaterial: (id) => {
    const m = getEngMaterial(id);
    set((s) => ({
      materialId: id,
      E: m.E,
      yieldStress: m.yield,
      // Re-skin every existing member with the new modulus.
      model: {
        ...s.model,
        elements: s.model.elements.map((e) => ({ ...e, E: m.E })),
      },
      result: null,
      rev: s.rev + 1,
    }));
  },

  loadPreset: (id) => {
    const p = FEA_PRESETS.find((x) => x.id === id);
    if (p) set((s) => ({ model: JSON.parse(JSON.stringify(p.model)), result: null, rev: s.rev + 1 }));
  },

  clear: () =>
    set((s) => ({
      model: { nodes: [], elements: [], loads: [] },
      result: null,
      selectedNode: null,
      elementFrom: null,
      rev: s.rev + 1,
    })),

  solve: () => {
    const r = solveTruss(get().model);
    // Auto-fit the deformed-shape scale so the largest displacement draws as
    // ~0.6 m on the model (real truss deflections are sub-millimetre, so a
    // fixed scale made the deformation invisible).
    if (!r.unstable && r.maxDisp > 0) {
      set({ dispScale: Math.max(1, Math.min(1e7, 0.6 / r.maxDisp)) });
    }
    set({ result: r });
    return r;
  },
}));
