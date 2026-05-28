import { create } from 'zustand';
import { buildDataset, type Dataset } from '@/lib/viz/datasets';
import type { ColormapId } from '@/lib/viz/colormaps';

export type FilterMode = 'points' | 'threshold' | 'slice';

interface VizStore {
  dataset: Dataset;
  colormap: ColormapId;
  filter: FilterMode;
  /** threshold band as fraction 0..1 of the scalar range */
  thLow: number;
  thHigh: number;
  /** slice plane position along an axis */
  sliceAxis: 'x' | 'y' | 'z';
  slicePos: number; // fraction 0..1
  sliceThickness: number; // fraction
  pointSize: number;
  opacity: number;
  rev: number;

  setDataset: (d: Dataset) => void;
  loadBuiltin: (id: string) => void;
  setColormap: (c: ColormapId) => void;
  setFilter: (f: FilterMode) => void;
  setThreshold: (lo: number, hi: number) => void;
  setSliceAxis: (a: 'x' | 'y' | 'z') => void;
  setSlicePos: (p: number) => void;
  setSliceThickness: (t: number) => void;
  setPointSize: (n: number) => void;
  setOpacity: (n: number) => void;
}

export const useVizStore = create<VizStore>((set) => ({
  dataset: buildDataset('gaussian'),
  colormap: 'viridis',
  filter: 'points',
  thLow: 0.45,
  thHigh: 1,
  sliceAxis: 'z',
  slicePos: 0.5,
  sliceThickness: 0.08,
  pointSize: 0.12,
  opacity: 0.9,
  rev: 0,

  setDataset: (d) => set((s) => ({ dataset: d, rev: s.rev + 1 })),
  loadBuiltin: (id) => set((s) => ({ dataset: buildDataset(id), rev: s.rev + 1 })),
  setColormap: (c) => set({ colormap: c }),
  setFilter: (f) => set({ filter: f }),
  setThreshold: (lo, hi) =>
    set({ thLow: Math.min(lo, hi), thHigh: Math.max(lo, hi) }),
  setSliceAxis: (a) => set({ sliceAxis: a }),
  setSlicePos: (p) => set({ slicePos: Math.max(0, Math.min(1, p)) }),
  setSliceThickness: (t) => set({ sliceThickness: Math.max(0.01, Math.min(0.5, t)) }),
  setPointSize: (n) => set({ pointSize: Math.max(0.02, Math.min(0.5, n)) }),
  setOpacity: (n) => set({ opacity: Math.max(0.1, Math.min(1, n)) }),
}));

export function getViz() {
  return useVizStore.getState();
}
