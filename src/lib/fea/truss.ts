/**
 * 2D truss finite-element solver — the linear direct-stiffness method, the
 * same approach CalculiX uses for bar/truss elements. Each node has 2 DOFs
 * (ux, uy). We assemble the global stiffness matrix K, apply displacement
 * boundary conditions, solve K·u = F, then recover member axial forces.
 */
import { solve } from '@/lib/circuitSolver/linalg';

export interface FeaNode {
  id: string;
  x: number;
  y: number;
  /** support: which DOFs are fixed */
  fixX: boolean;
  fixY: boolean;
}

export interface FeaElement {
  id: string;
  a: string; // node id
  b: string; // node id
  /** Young's modulus (Pa) */
  E: number;
  /** cross-section area (m²) */
  A: number;
}

export interface FeaLoad {
  node: string;
  fx: number;
  fy: number;
}

export interface FeaModel {
  nodes: FeaNode[];
  elements: FeaElement[];
  loads: FeaLoad[];
}

export interface ElementResult {
  id: string;
  /** axial force (N): + tension, − compression */
  force: number;
  stress: number;
  strain: number;
  length: number;
}

export interface FeaResult {
  /** displacement per node id: {ux, uy} (m) */
  disp: Record<string, { ux: number; uy: number }>;
  /** reaction forces per fixed DOF */
  reactions: Record<string, { rx: number; ry: number }>;
  elements: ElementResult[];
  maxDisp: number;
  maxStress: number;
  /** true if the structure is a mechanism / singular */
  unstable: boolean;
}

export function solveTruss(model: FeaModel): FeaResult {
  const { nodes, elements, loads } = model;
  const n = nodes.length;
  const ndof = n * 2;
  const idx = new Map<string, number>();
  nodes.forEach((nd, i) => idx.set(nd.id, i));

  // Global stiffness (dense)
  const K = new Float64Array(ndof * ndof);
  const F = new Float64Array(ndof);
  const lengths = new Map<string, number>();
  const dirs = new Map<string, { c: number; s: number }>();

  for (const el of elements) {
    const ia = idx.get(el.a);
    const ib = idx.get(el.b);
    if (ia === undefined || ib === undefined) continue;
    const na = nodes[ia];
    const nb = nodes[ib];
    const dx = nb.x - na.x;
    const dy = nb.y - na.y;
    const L = Math.hypot(dx, dy) || 1e-9;
    const c = dx / L;
    const s = dy / L;
    lengths.set(el.id, L);
    dirs.set(el.id, { c, s });
    const k = (el.E * el.A) / L;
    // local 4x4 in global coords
    const cc = c * c;
    const ss = s * s;
    const cs = c * s;
    const ke = [
      [cc, cs, -cc, -cs],
      [cs, ss, -cs, -ss],
      [-cc, -cs, cc, cs],
      [-cs, -ss, cs, ss],
    ];
    const map = [ia * 2, ia * 2 + 1, ib * 2, ib * 2 + 1];
    for (let r = 0; r < 4; r++)
      for (let cl = 0; cl < 4; cl++)
        K[map[r] * ndof + map[cl]] += k * ke[r][cl];
  }

  for (const ld of loads) {
    const i = idx.get(ld.node);
    if (i === undefined) continue;
    F[i * 2] += ld.fx;
    F[i * 2 + 1] += ld.fy;
  }

  // Apply BCs: collect free DOFs
  const fixed: boolean[] = new Array(ndof).fill(false);
  nodes.forEach((nd, i) => {
    if (nd.fixX) fixed[i * 2] = true;
    if (nd.fixY) fixed[i * 2 + 1] = true;
  });
  const free: number[] = [];
  for (let i = 0; i < ndof; i++) if (!fixed[i]) free.push(i);

  const u = new Float64Array(ndof);
  let unstable = false;
  if (free.length > 0) {
    const m = free.length;
    const Kr = new Float64Array(m * m);
    const Fr = new Float64Array(m);
    for (let r = 0; r < m; r++) {
      Fr[r] = F[free[r]];
      for (let cl = 0; cl < m; cl++) Kr[r * m + cl] = K[free[r] * ndof + free[cl]];
    }
    try {
      const x = solve(Kr, Fr, m);
      for (let r = 0; r < m; r++) u[free[r]] = x[r];
    } catch {
      unstable = true;
    }
  }

  // Element forces
  const elemResults: ElementResult[] = [];
  let maxStress = 0;
  for (const el of elements) {
    const ia = idx.get(el.a)!;
    const ib = idx.get(el.b)!;
    const L = lengths.get(el.id) ?? 1;
    const d = dirs.get(el.id) ?? { c: 1, s: 0 };
    const uax = u[ia * 2];
    const uay = u[ia * 2 + 1];
    const ubx = u[ib * 2];
    const uby = u[ib * 2 + 1];
    // axial elongation
    const elong = (ubx - uax) * d.c + (uby - uay) * d.s;
    const strain = elong / L;
    const stress = el.E * strain;
    const force = stress * el.A;
    if (Math.abs(stress) > maxStress) maxStress = Math.abs(stress);
    elemResults.push({ id: el.id, force, stress, strain, length: L });
  }

  // Displacements + reactions
  const disp: Record<string, { ux: number; uy: number }> = {};
  let maxDisp = 0;
  nodes.forEach((nd, i) => {
    const ux = u[i * 2];
    const uy = u[i * 2 + 1];
    disp[nd.id] = { ux, uy };
    maxDisp = Math.max(maxDisp, Math.hypot(ux, uy));
  });

  // Reactions = K·u − F at fixed DOFs
  const reactions: Record<string, { rx: number; ry: number }> = {};
  nodes.forEach((nd, i) => {
    if (!nd.fixX && !nd.fixY) return;
    let rx = -F[i * 2];
    let ry = -F[i * 2 + 1];
    for (let j = 0; j < ndof; j++) {
      rx += K[(i * 2) * ndof + j] * u[j];
      ry += K[(i * 2 + 1) * ndof + j] * u[j];
    }
    reactions[nd.id] = { rx: nd.fixX ? rx : 0, ry: nd.fixY ? ry : 0 };
  });

  return { disp, reactions, elements: elemResults, maxDisp, maxStress, unstable };
}
