/**
 * Modified Nodal Analysis (MNA) solver for analog circuits.
 *
 * Standard MNA system:
 *
 *   [ G  B ] [ v ]   [ I ]
 *   [ Cᵀ D ] [ j ] = [ E ]
 *
 * where v are node voltages (excluding ground), j are extra branch currents
 * for voltage sources / inductors, G is admittance, B/C couple voltages to
 * those currents, D is zero for ideal V-sources.
 *
 * Capacitors and inductors are integrated using **backward Euler companion
 * models**:
 *   C: I_eq = (C/dt)·V_prev,   G_eq = C/dt
 *   L: V_eq = (L/dt)·I_prev,   contributes a stamp like a V-source plus G_eq
 *
 * Diodes use Newton-Raphson with Shockley equation:
 *   I(V) = Is·(exp(V/Vt) − 1)
 * linearized about the previous iteration value.
 */

import type { AnalogCircuit, CircuitComp, DCResult, TransientResult } from './types';
import { at, mat, set, add, solve, type Matrix, type Vector } from './linalg';

const VT = 0.02585; // thermal voltage @ ~300K
const IS = 1e-12;
const NR_TOL = 1e-7;
const NR_MAX_ITER = 80;

/** Collect non-ground nodes and assign them an index in the MNA matrix. */
function buildNodeMap(circuit: AnalogCircuit): { idx: Map<string, number>; n: number } {
  const idx = new Map<string, number>();
  // Identify ground nodes — any node connected to a ground component pin
  const groundNodes = new Set<string>();
  for (const c of circuit.components) {
    if (c.type === 'ground') {
      const pin = c.pins.p;
      if (pin) groundNodes.add(pin);
    }
  }
  for (const n of circuit.nodes) {
    if (!groundNodes.has(n)) idx.set(n, idx.size);
  }
  // map ground nodes to -1
  for (const n of groundNodes) idx.set(n, -1);
  return { idx, n: Array.from(idx.values()).filter((v) => v >= 0).length };
}

/** Identify components that contribute an extra branch-current row. */
function branchComponents(circuit: AnalogCircuit): CircuitComp[] {
  return circuit.components.filter(
    (c) =>
      c.type === 'vsource' ||
      c.type === 'vsource_ac' ||
      c.type === 'battery' ||
      c.type === 'ammeter' ||
      c.type === 'inductor' ||
      c.type === 'opamp',
  );
}

interface CompanionState {
  /** Previous-timestep voltage across capacitors */
  capV: Map<string, number>;
  /** Previous-timestep current through inductors */
  indI: Map<string, number>;
}

function emptyState(): CompanionState {
  return { capV: new Map(), indI: new Map() };
}

interface BuildOpts {
  dt: number; // 0 for DC operating point
  state: CompanionState;
  time: number;
  /** For Newton-Raphson on diodes, pass previous voltages keyed by diode id */
  diodeV: Map<string, number>;
}

interface MNASystem {
  A: Matrix;
  b: Vector;
  size: number;
  nodeIdx: Map<string, number>;
  branchIdx: Map<string, number>;
  /** non-ground node count (for splitting v vs j in solution) */
  nNodes: number;
}

function buildSystem(circuit: AnalogCircuit, opts: BuildOpts): MNASystem {
  const { idx: nodeIdx, n: nNodes } = buildNodeMap(circuit);
  const branches = branchComponents(circuit);
  const branchIdx = new Map<string, number>();
  for (const b of branches) branchIdx.set(b.id, nNodes + branchIdx.size);
  const size = nNodes + branches.length;
  const A = mat(size);
  const b = new Float64Array(size);

  // Helpers
  const stamp = (i: number, j: number, v: number) => {
    if (i < 0 || j < 0) return;
    add(A, size, i, j, v);
  };

  for (const c of circuit.components) {
    if (c.type === 'wire' || c.type === 'ground') continue;
    if (c.type === 'resistor') {
      const a = nodeIdx.get(c.pins.a)!;
      const bn = nodeIdx.get(c.pins.b)!;
      const g = 1 / Math.max(1e-12, c.value);
      stamp(a, a, g);
      stamp(bn, bn, g);
      stamp(a, bn, -g);
      stamp(bn, a, -g);
    } else if (c.type === 'capacitor') {
      const a = nodeIdx.get(c.pins.a)!;
      const bn = nodeIdx.get(c.pins.b)!;
      if (opts.dt === 0) {
        // DC operating point: open circuit — do nothing
      } else {
        const Geq = c.value / opts.dt;
        const Vprev = opts.state.capV.get(c.id) ?? 0;
        const Ieq = Geq * Vprev;
        stamp(a, a, Geq);
        stamp(bn, bn, Geq);
        stamp(a, bn, -Geq);
        stamp(bn, a, -Geq);
        if (a >= 0) b[a] += Ieq;
        if (bn >= 0) b[bn] -= Ieq;
      }
    } else if (c.type === 'inductor') {
      const a = nodeIdx.get(c.pins.a)!;
      const bn = nodeIdx.get(c.pins.b)!;
      const bi = branchIdx.get(c.id)!;
      // V_a − V_b − (L/dt)·j = (L/dt)·I_prev  (BE for L)
      // We add a branch current j for the inductor.
      if (a >= 0) add(A, size, a, bi, 1);
      if (bn >= 0) add(A, size, bn, bi, -1);
      if (a >= 0) add(A, size, bi, a, 1);
      if (bn >= 0) add(A, size, bi, bn, -1);
      if (opts.dt > 0) {
        const Req = c.value / opts.dt;
        add(A, size, bi, bi, -Req);
        const Iprev = opts.state.indI.get(c.id) ?? 0;
        b[bi] = -Req * Iprev;
      } else {
        // DC: short circuit (L acts like a wire)
        b[bi] = 0;
      }
    } else if (
      c.type === 'vsource' ||
      c.type === 'vsource_ac' ||
      c.type === 'battery' ||
      c.type === 'ammeter'
    ) {
      const a = nodeIdx.get(c.pins.p)!;
      const bn = nodeIdx.get(c.pins.n)!;
      const bi = branchIdx.get(c.id)!;
      if (a >= 0) add(A, size, a, bi, 1);
      if (bn >= 0) add(A, size, bn, bi, -1);
      if (a >= 0) add(A, size, bi, a, 1);
      if (bn >= 0) add(A, size, bi, bn, -1);
      const V =
        c.type === 'vsource_ac'
          ? c.value * Math.sin(2 * Math.PI * (c.freq ?? 60) * opts.time)
          : c.type === 'ammeter'
            ? 0 // ideal ammeter: 0 V branch, reads its current directly
            : c.value;
      b[bi] = V;
    } else if (
      c.type === 'switch' ||
      c.type === 'lamp' ||
      c.type === 'fuse' ||
      c.type === 'voltmeter'
    ) {
      const a = nodeIdx.get(c.pins.a)!;
      const bn = nodeIdx.get(c.pins.b)!;
      let R: number;
      if (c.type === 'switch') R = c.initial ? 1e-3 : 1e12; // initial=1 closed
      else if (c.type === 'voltmeter') R = 1e9; // ideal-ish: negligible current
      else if (c.type === 'fuse') R = Math.max(1e-3, c.value || 0.01);
      else R = Math.max(1e-3, c.value || 100); // lamp
      const g = 1 / R;
      stamp(a, a, g);
      stamp(bn, bn, g);
      stamp(a, bn, -g);
      stamp(bn, a, -g);
    } else if (c.type === 'potentiometer') {
      // 3-terminal: a — wiper(w) — b. R total = value; ratio in `initial` (0..1)
      const a = nodeIdx.get(c.pins.a)!;
      const w = nodeIdx.get(c.pins.w)!;
      const bn = nodeIdx.get(c.pins.b)!;
      const ratio = Math.max(0.001, Math.min(0.999, c.initial ?? 0.5));
      const Rtot = Math.max(1, c.value || 10000);
      const g1 = 1 / (Rtot * ratio);
      const g2 = 1 / (Rtot * (1 - ratio));
      stamp(a, a, g1);
      stamp(w, w, g1);
      stamp(a, w, -g1);
      stamp(w, a, -g1);
      stamp(w, w, g2);
      stamp(bn, bn, g2);
      stamp(w, bn, -g2);
      stamp(bn, w, -g2);
    } else if (c.type === 'opamp') {
      // Ideal op-amp: forces V(p) = V(n); output supplies any current.
      const p = nodeIdx.get(c.pins.p)!;
      const n = nodeIdx.get(c.pins.n)!;
      const o = nodeIdx.get(c.pins.o)!;
      const bi = branchIdx.get(c.id)!;
      if (o >= 0) add(A, size, o, bi, 1); // output current
      if (p >= 0) add(A, size, bi, p, 1); // constraint: v(p) - v(n) = 0
      if (n >= 0) add(A, size, bi, n, -1);
      b[bi] = 0;
    } else if (c.type === 'isource') {
      const a = nodeIdx.get(c.pins.p)!;
      const bn = nodeIdx.get(c.pins.n)!;
      if (a >= 0) b[a] -= c.value;
      if (bn >= 0) b[bn] += c.value;
    } else if (c.type === 'diode' || c.type === 'led') {
      const a = nodeIdx.get(c.pins.a)!;
      const bn = nodeIdx.get(c.pins.k)!;
      const V0 = opts.diodeV.get(c.id) ?? 0;
      // Linearize Shockley at V0: I = Is·(exp(V/Vt) − 1)
      // Geq = (Is/Vt)·exp(V0/Vt),  Ieq = Is·(exp(V0/Vt) − 1) − Geq·V0
      const expv = Math.exp(Math.min(40, V0 / VT));
      const Geq = (IS / VT) * expv;
      const Ieq = IS * (expv - 1) - Geq * V0;
      stamp(a, a, Geq);
      stamp(bn, bn, Geq);
      stamp(a, bn, -Geq);
      stamp(bn, a, -Geq);
      if (a >= 0) b[a] -= Ieq;
      if (bn >= 0) b[bn] += Ieq;
    }
  }

  return { A, b, size, nodeIdx, branchIdx, nNodes };
}

/**
 * Solve for DC operating point. Runs Newton-Raphson when diodes are present.
 */
export function solveDC(circuit: AnalogCircuit): DCResult {
  const state = emptyState();
  const diodeV = new Map<string, number>();
  let prev: Vector = new Float64Array(0);

  for (let iter = 0; iter < NR_MAX_ITER; iter++) {
    const sys = buildSystem(circuit, { dt: 0, state, time: 0, diodeV });
    if (sys.size === 0) return { nodeVoltages: {}, branchCurrents: {} };
    const x = solve(sys.A, sys.b, sys.size);
    if (prev.length === x.length) {
      let dx = 0;
      for (let i = 0; i < x.length; i++) {
        const d = x[i] - prev[i];
        dx += d * d;
      }
      if (Math.sqrt(dx) < NR_TOL) {
        prev = x;
        break;
      }
    }
    prev = x;
    // Update diode voltages from solution
    for (const c of circuit.components) {
      if (c.type === 'diode' || c.type === 'led') {
        const a = sys.nodeIdx.get(c.pins.a)!;
        const k = sys.nodeIdx.get(c.pins.k)!;
        const va = a < 0 ? 0 : x[a];
        const vk = k < 0 ? 0 : x[k];
        diodeV.set(c.id, va - vk);
      }
    }
    void at;
    void set;
    if (circuit.components.every((c) => c.type !== 'diode' && c.type !== 'led'))
      break; // linear → 1 iter
  }

  // Extract results
  const sys = buildSystem(circuit, { dt: 0, state, time: 0, diodeV });
  const x = solve(sys.A, sys.b, sys.size);
  return extractResults(x, sys);
}

function extractResults(x: Vector, sys: MNASystem): DCResult {
  const nodeVoltages: Record<string, number> = {};
  for (const [name, i] of sys.nodeIdx) {
    nodeVoltages[name] = i < 0 ? 0 : x[i];
  }
  const branchCurrents: Record<string, number> = {};
  for (const [name, i] of sys.branchIdx) {
    branchCurrents[name] = x[i];
  }
  return { nodeVoltages, branchCurrents };
}

/** Run transient analysis from 0..duration with timestep dt. */
export function solveTransient(
  circuit: AnalogCircuit,
  duration: number,
  dt: number,
): TransientResult {
  // Initialize companion state from DC operating point so we start from a real steady state.
  const dc = solveDC(circuit);
  const state = emptyState();
  for (const c of circuit.components) {
    if (c.type === 'capacitor') {
      const va = dc.nodeVoltages[c.pins.a] ?? 0;
      const vb = dc.nodeVoltages[c.pins.b] ?? 0;
      state.capV.set(c.id, va - vb);
    } else if (c.type === 'inductor') {
      state.indI.set(c.id, dc.branchCurrents[c.id] ?? 0);
    }
  }

  const tSamples: number[] = [];
  const nodeVoltages: Record<string, number[]> = {};
  const branchCurrents: Record<string, number[]> = {};

  const diodeV = new Map<string, number>();
  for (const c of circuit.components)
    if (c.type === 'diode' || c.type === 'led') diodeV.set(c.id, 0);

  let t = 0;
  while (t <= duration + 1e-9) {
    // Newton-Raphson for diodes within this timestep
    let prev: Vector = new Float64Array(0);
    let sysRef: MNASystem | null = null;
    let xRef: Vector | null = null;
    for (let iter = 0; iter < NR_MAX_ITER; iter++) {
      const sys = buildSystem(circuit, { dt, state, time: t, diodeV });
      const x = solve(sys.A, sys.b, sys.size);
      sysRef = sys;
      xRef = x;
      if (prev.length === x.length) {
        let d = 0;
        for (let i = 0; i < x.length; i++) {
          const e = x[i] - prev[i];
          d += e * e;
        }
        if (Math.sqrt(d) < NR_TOL) break;
      }
      prev = x;
      let updated = false;
      for (const c of circuit.components) {
        if (c.type !== 'diode' && c.type !== 'led') continue;
        updated = true;
        const a = sys.nodeIdx.get(c.pins.a)!;
        const k = sys.nodeIdx.get(c.pins.k)!;
        const va = a < 0 ? 0 : x[a];
        const vk = k < 0 ? 0 : x[k];
        diodeV.set(c.id, va - vk);
      }
      if (!updated) break;
    }
    const sys = sysRef!;
    const x = xRef!;

    // Record
    tSamples.push(t);
    for (const [name, i] of sys.nodeIdx) {
      if (!nodeVoltages[name]) nodeVoltages[name] = [];
      nodeVoltages[name].push(i < 0 ? 0 : x[i]);
    }
    for (const [name, i] of sys.branchIdx) {
      if (!branchCurrents[name]) branchCurrents[name] = [];
      branchCurrents[name].push(x[i]);
    }

    // Update companion state for next step
    for (const c of circuit.components) {
      if (c.type === 'capacitor') {
        const a = sys.nodeIdx.get(c.pins.a)!;
        const bn = sys.nodeIdx.get(c.pins.b)!;
        const va = a < 0 ? 0 : x[a];
        const vb = bn < 0 ? 0 : x[bn];
        state.capV.set(c.id, va - vb);
      } else if (c.type === 'inductor') {
        const bi = sys.branchIdx.get(c.id)!;
        state.indI.set(c.id, x[bi]);
      }
    }

    t += dt;
  }
  return { t: tSamples, nodeVoltages, branchCurrents };
}
