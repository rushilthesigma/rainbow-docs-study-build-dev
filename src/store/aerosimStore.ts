import { create } from 'zustand';
import type { AirfoilId } from '@/lib/cfd/naca';
import type * as THREE from 'three';
import type { Vec2 } from '@/lib/physics2d/math';

export type AeroMode = 'simple' | 'advanced';
export type VizMode = 'streamlines' | 'vorticity' | 'pressure';
export type SweepResult = { x: number; cl: number; cd: number; ld: number };
/** Where the test geometry comes from */
export type ShapeSource = 'preset' | 'naca' | 'import';

export interface ImportedModel {
  name: string;
  /** Normalised 2D silhouette (unit chord) used by the solvers + 2D view */
  silhouette: Vec2[];
  /** Full 3D geometry for the 3D preview (kept out of persistence) */
  geometry: THREE.BufferGeometry;
}

interface AeroState {
  airfoil: AirfoilId;
  /** Custom NACA M (max camber, 0..0.09) */
  customM: number;
  /** Custom NACA P (camber position, 0..0.9) */
  customP: number;
  /** Custom NACA T (thickness, 0..0.4) */
  customT: number;
  /** When true, the engine uses customM/P/T instead of the airfoil preset */
  useCustom: boolean;
  /** Active geometry source */
  source: ShapeSource;
  /** The imported model (when source === 'import') */
  imported: ImportedModel | null;
  /** Pause/run the flow visualization */
  running: boolean;
  /** angle of attack in degrees (UI-friendly) */
  aoaDeg: number;
  /** velocity m/s */
  V: number;
  /** density kg/m³ */
  rho: number;
  /** chord length m */
  chord: number;

  mode: AeroMode;
  viz: VizMode;
  threeD: boolean;
  showResultsPanel: boolean;
  sweep: SweepResult[] | null;
  rev: number;

  setAirfoil: (a: AirfoilId) => void;
  setCustomM: (m: number) => void;
  setCustomP: (p: number) => void;
  setCustomT: (t: number) => void;
  setUseCustom: (b: boolean) => void;
  setImported: (m: ImportedModel | null) => void;
  setRunning: (b: boolean) => void;
  setAoaDeg: (d: number) => void;
  setV: (v: number) => void;
  setRho: (r: number) => void;
  setChord: (c: number) => void;
  setMode: (m: AeroMode) => void;
  setViz: (v: VizMode) => void;
  setThreeD: (b: boolean) => void;
  setSweep: (s: SweepResult[] | null) => void;
  bump: () => void;
}

export const useAerosimStore = create<AeroState>((set) => ({
  airfoil: 'naca2412',
  customM: 0.02,
  customP: 0.4,
  customT: 0.12,
  useCustom: false,
  source: 'preset',
  imported: null,
  running: true,
  aoaDeg: 5,
  V: 30,
  rho: 1.225,
  chord: 1,
  mode: 'simple',
  viz: 'streamlines',
  threeD: false,
  showResultsPanel: true,
  sweep: null,
  rev: 0,

  setAirfoil: (a) =>
    set({ airfoil: a, useCustom: false, source: 'preset', rev: 0 }),
  setCustomM: (m) =>
    set({ customM: Math.max(0, Math.min(0.09, m)), useCustom: true, source: 'naca' }),
  setCustomP: (p) =>
    set({ customP: Math.max(0.1, Math.min(0.9, p)), useCustom: true, source: 'naca' }),
  setCustomT: (t) =>
    set({ customT: Math.max(0.04, Math.min(0.3, t)), useCustom: true, source: 'naca' }),
  setUseCustom: (b) => set({ useCustom: b, source: b ? 'naca' : 'preset' }),
  setImported: (m) =>
    set((s) => ({
      imported: m,
      source: m ? 'import' : 'preset',
      rev: s.rev + 1,
    })),
  setRunning: (b) => set({ running: b }),
  setAoaDeg: (d) => set({ aoaDeg: Math.max(-30, Math.min(30, d)) }),
  setV: (v) => set({ V: Math.max(0.5, Math.min(300, v)) }),
  setRho: (r) => set({ rho: Math.max(0.001, Math.min(20, r)) }),
  setChord: (c) => set({ chord: Math.max(0.05, Math.min(10, c)) }),
  setMode: (m) => set({ mode: m }),
  setViz: (v) => set({ viz: v }),
  setThreeD: (b) => set({ threeD: b }),
  setSweep: (s) => set({ sweep: s }),
  bump: () => set((s) => ({ rev: s.rev + 1 })),
}));
