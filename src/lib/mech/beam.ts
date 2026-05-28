/**
 * Euler–Bernoulli beam analysis. Supports two boundary conditions:
 *   - cantilever  (fixed at x=0, free at x=L)
 *   - simple      (pin at x=0, roller at x=L)
 *
 * Loading: a point load P at position a, plus a uniformly distributed load w.
 * We compute reactions from statics, then shear V(x) and moment M(x), then
 * integrate curvature M/(EI) twice with the appropriate boundary conditions
 * to get the deflection curve. All quantities are returned sampled along x.
 */
export type BeamSupport = 'cantilever' | 'simple';

export interface BeamInput {
  support: BeamSupport;
  L: number; // length (m)
  E: number; // Young's modulus (Pa)
  I: number; // 2nd moment of area (m^4)
  /** section half-height for bending stress σ = M·c / I (m) */
  c: number;
  P: number; // point load (N, downward +)
  a: number; // point load position from x=0 (m)
  w: number; // uniformly distributed load (N/m, downward +)
  n?: number; // samples
}

export interface BeamResult {
  x: number[];
  shear: number[];
  moment: number[];
  deflection: number[]; // m (downward negative)
  stress: number[]; // Pa
  maxDeflection: number;
  maxMoment: number;
  maxStress: number;
  reactions: { R0: number; M0?: number; RL?: number };
}

export function solveBeam(inp: BeamInput): BeamResult {
  const n = inp.n ?? 200;
  const { L, E, I, c, P, a, w } = inp;
  const dx = L / n;
  const x: number[] = [];
  for (let i = 0; i <= n; i++) x.push(i * dx);

  const Wtot = w * L;
  let R0 = 0;
  let RL = 0;
  let M0 = 0;
  if (inp.support === 'cantilever') {
    // fixed end at 0 carries everything
    R0 = P + Wtot;
    M0 = P * a + Wtot * (L / 2); // fixing moment at the wall
  } else {
    // simply supported: sum moments about x=0 -> RL
    RL = (P * a + Wtot * (L / 2)) / L;
    R0 = P + Wtot - RL;
  }

  const shear: number[] = [];
  const moment: number[] = [];
  for (let i = 0; i <= n; i++) {
    const xi = x[i];
    // shear: reactions minus loads to the left of the cut
    let V = 0;
    let M = 0;
    if (inp.support === 'cantilever') {
      V = R0 - w * xi - (xi >= a ? P : 0);
      M = -M0 + R0 * xi - (w * xi * xi) / 2 - (xi >= a ? P * (xi - a) : 0);
    } else {
      V = R0 - w * xi - (xi >= a ? P : 0);
      M = R0 * xi - (w * xi * xi) / 2 - (xi >= a ? P * (xi - a) : 0);
    }
    shear.push(V);
    moment.push(M);
  }

  // Integrate curvature κ = M/(E I) twice → slope θ, deflection v
  const EI = E * I || 1;
  const theta: number[] = new Array(n + 1).fill(0);
  const v: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    theta[i] = theta[i - 1] + ((moment[i] + moment[i - 1]) / 2 / EI) * dx;
  }
  for (let i = 1; i <= n; i++) {
    v[i] = v[i - 1] + ((theta[i] + theta[i - 1]) / 2) * dx;
  }

  if (inp.support === 'cantilever') {
    // θ(0)=0, v(0)=0 already satisfied by integration constants = 0
  } else {
    // simple: v(0)=0 and v(L)=0. Our integration set v(0)=0 with θ(0)=0;
    // correct by adding a linear term so v(L)=0: v*(x) = v(x) − x·v(L)/L
    const vL = v[n];
    for (let i = 0; i <= n; i++) v[i] -= (x[i] / L) * vL;
  }

  const stress = moment.map((m) => (Math.abs(m) * c) / (I || 1e-12));
  const maxDeflection = Math.max(...v.map(Math.abs));
  const maxMoment = Math.max(...moment.map(Math.abs));
  const maxStress = Math.max(...stress);

  return {
    x,
    shear,
    moment,
    deflection: v,
    stress,
    maxDeflection,
    maxMoment,
    maxStress,
    reactions:
      inp.support === 'cantilever' ? { R0, M0 } : { R0, RL },
  };
}

/** Rectangular section helper: I = b·h³/12, c = h/2. */
export function rectSection(b: number, h: number) {
  return { I: (b * h * h * h) / 12, c: h / 2 };
}
