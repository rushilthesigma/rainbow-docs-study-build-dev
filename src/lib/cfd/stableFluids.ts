/**
 * Stam's stable-fluids solver (Real-Time Fluid Dynamics for Games, 2003).
 *
 *   step:
 *     1. add forces (inflow boundary + obstacle stamping)
 *     2. diffuse velocity (Gauss-Seidel)
 *     3. project (mass-conservation: u ← u − ∇p, Poisson solve via Gauss-Seidel)
 *     4. advect velocity (semi-Lagrangian backtrace + bilinear sample)
 *     5. project again
 *     6. diffuse density, advect density
 *
 * The grid is W × H cells (indexed [j*W + i]) with a 1-cell guard band reused
 * for boundary conditions. Cells flagged `solid` clamp velocity to 0; this is
 * how the airfoil sits in the flow.
 */

const N_GAUSS = 20;

export interface Grid {
  W: number;
  H: number;
  u: Float32Array; // x-velocity per cell
  v: Float32Array; // y-velocity per cell
  u0: Float32Array;
  v0: Float32Array;
  dens: Float32Array;
  dens0: Float32Array;
  /** 1 if cell is inside the obstacle, else 0 */
  solid: Uint8Array;
}

export function makeGrid(W: number, H: number): Grid {
  const n = W * H;
  return {
    W,
    H,
    u: new Float32Array(n),
    v: new Float32Array(n),
    u0: new Float32Array(n),
    v0: new Float32Array(n),
    dens: new Float32Array(n),
    dens0: new Float32Array(n),
    solid: new Uint8Array(n),
  };
}

const IX = (W: number, i: number, j: number) => j * W + i;

/** Apply zero-velocity at solid walls and at left inflow we keep u0. */
function setBoundary(g: Grid, kind: 0 | 1 | 2, x: Float32Array) {
  const { W, H } = g;
  // Walls: top/bottom mirror or zero
  for (let i = 1; i < W - 1; i++) {
    x[IX(W, i, 0)] = kind === 2 ? -x[IX(W, i, 1)] : x[IX(W, i, 1)];
    x[IX(W, i, H - 1)] = kind === 2 ? -x[IX(W, i, H - 2)] : x[IX(W, i, H - 2)];
  }
  for (let j = 1; j < H - 1; j++) {
    x[IX(W, 0, j)] = kind === 1 ? -x[IX(W, 1, j)] : x[IX(W, 1, j)];
    x[IX(W, W - 1, j)] = kind === 1 ? -x[IX(W, W - 2, j)] : x[IX(W, W - 2, j)];
  }
  x[IX(W, 0, 0)] = 0.5 * (x[IX(W, 1, 0)] + x[IX(W, 0, 1)]);
  x[IX(W, 0, H - 1)] = 0.5 * (x[IX(W, 1, H - 1)] + x[IX(W, 0, H - 2)]);
  x[IX(W, W - 1, 0)] = 0.5 * (x[IX(W, W - 2, 0)] + x[IX(W, W - 1, 1)]);
  x[IX(W, W - 1, H - 1)] = 0.5 * (x[IX(W, W - 2, H - 1)] + x[IX(W, W - 1, H - 2)]);
  // Solid cells: clamp tangential field too
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      if (g.solid[IX(W, i, j)]) {
        if (kind === 1 || kind === 2) x[IX(W, i, j)] = 0;
      }
    }
  }
}

function linSolve(g: Grid, kind: 0 | 1 | 2, x: Float32Array, x0: Float32Array, a: number, c: number) {
  const { W, H } = g;
  for (let k = 0; k < N_GAUSS; k++) {
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        if (g.solid[IX(W, i, j)]) continue;
        x[IX(W, i, j)] =
          (x0[IX(W, i, j)] +
            a *
              (x[IX(W, i - 1, j)] +
                x[IX(W, i + 1, j)] +
                x[IX(W, i, j - 1)] +
                x[IX(W, i, j + 1)])) /
          c;
      }
    }
    setBoundary(g, kind, x);
  }
}

function diffuse(g: Grid, kind: 0 | 1 | 2, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
  const a = dt * diff * (g.W - 2) * (g.H - 2);
  linSolve(g, kind, x, x0, a, 1 + 4 * a);
}

function advect(
  g: Grid,
  kind: 0 | 1 | 2,
  d: Float32Array,
  d0: Float32Array,
  u: Float32Array,
  v: Float32Array,
  dt: number,
) {
  const { W, H } = g;
  const dtX = dt * (W - 2);
  const dtY = dt * (H - 2);
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      if (g.solid[IX(W, i, j)]) {
        d[IX(W, i, j)] = 0;
        continue;
      }
      let x = i - dtX * u[IX(W, i, j)];
      let y = j - dtY * v[IX(W, i, j)];
      if (x < 0.5) x = 0.5;
      if (x > W - 1.5) x = W - 1.5;
      if (y < 0.5) y = 0.5;
      if (y > H - 1.5) y = H - 1.5;
      const i0 = Math.floor(x);
      const i1 = i0 + 1;
      const j0 = Math.floor(y);
      const j1 = j0 + 1;
      const s1 = x - i0;
      const s0 = 1 - s1;
      const t1 = y - j0;
      const t0 = 1 - t1;
      d[IX(W, i, j)] =
        s0 * (t0 * d0[IX(W, i0, j0)] + t1 * d0[IX(W, i0, j1)]) +
        s1 * (t0 * d0[IX(W, i1, j0)] + t1 * d0[IX(W, i1, j1)]);
    }
  }
  setBoundary(g, kind, d);
}

function project(g: Grid, u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
  const { W, H } = g;
  const h = 1 / Math.max(W - 2, H - 2);
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      div[IX(W, i, j)] =
        -0.5 *
        h *
        (u[IX(W, i + 1, j)] - u[IX(W, i - 1, j)] + v[IX(W, i, j + 1)] - v[IX(W, i, j - 1)]);
      p[IX(W, i, j)] = 0;
    }
  }
  setBoundary(g, 0, div);
  setBoundary(g, 0, p);
  linSolve(g, 0, p, div, 1, 4);
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      u[IX(W, i, j)] -= (0.5 * (p[IX(W, i + 1, j)] - p[IX(W, i - 1, j)])) / h;
      v[IX(W, i, j)] -= (0.5 * (p[IX(W, i, j + 1)] - p[IX(W, i, j - 1)])) / h;
    }
  }
  setBoundary(g, 1, u);
  setBoundary(g, 2, v);
}

export function step(g: Grid, dt: number, visc = 1e-4, diff = 1e-4, inflowU = 1.0) {
  const { W, H } = g;
  // Inflow along left edge
  for (let j = 1; j < H - 1; j++) {
    g.u[IX(W, 1, j)] = inflowU;
    g.dens[IX(W, 1, j)] = Math.max(g.dens[IX(W, 1, j)], 0.5);
  }
  // Velocity step
  swap(g, 'u');
  swap(g, 'v');
  diffuse(g, 1, g.u, g.u0, visc, dt);
  diffuse(g, 2, g.v, g.v0, visc, dt);
  project(g, g.u, g.v, g.u0, g.v0);
  swap(g, 'u');
  swap(g, 'v');
  advect(g, 1, g.u, g.u0, g.u0, g.v0, dt);
  advect(g, 2, g.v, g.v0, g.u0, g.v0, dt);
  project(g, g.u, g.v, g.u0, g.v0);
  // Density step
  swap(g, 'dens');
  diffuse(g, 0, g.dens, g.dens0, diff, dt);
  swap(g, 'dens');
  advect(g, 0, g.dens, g.dens0, g.u, g.v, dt);
}

function swap(g: Grid, name: 'u' | 'v' | 'dens') {
  if (name === 'u') {
    const t = g.u;
    g.u = g.u0;
    g.u0 = t;
  } else if (name === 'v') {
    const t = g.v;
    g.v = g.v0;
    g.v0 = t;
  } else {
    const t = g.dens;
    g.dens = g.dens0;
    g.dens0 = t;
  }
}

/** Curl (vorticity) at cell center, finite-difference. */
export function vorticity(g: Grid, i: number, j: number): number {
  const { W } = g;
  if (i <= 0 || i >= g.W - 1 || j <= 0 || j >= g.H - 1) return 0;
  const dvdx = g.v[IX(W, i + 1, j)] - g.v[IX(W, i - 1, j)];
  const dudy = g.u[IX(W, i, j + 1)] - g.u[IX(W, i, j - 1)];
  return 0.5 * (dvdx - dudy);
}

/** Stamp a polygon into the solid mask. Coordinates in grid space (cells). */
export function stampObstacle(g: Grid, polygon: { x: number; y: number }[]) {
  const { W, H } = g;
  // Clear first
  for (let i = 0; i < g.solid.length; i++) g.solid[i] = 0;
  // For each cell, ray-cast point in polygon
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      if (pointInPolygon(i + 0.5, j + 0.5, polygon)) {
        g.solid[IX(W, i, j)] = 1;
        g.u[IX(W, i, j)] = 0;
        g.v[IX(W, i, j)] = 0;
      }
    }
  }
}

function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export { IX };
