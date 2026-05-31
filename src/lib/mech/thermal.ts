/**
 * 2D steady-state heat conduction on a rectangular plate, solved by
 * finite differences + Gauss-Seidel iteration with successive over-relaxation.
 *
 *   ∇²T + q/k = 0   (Poisson) with Dirichlet edge temperatures.
 *
 * Returns the temperature grid plus min/max for colormapping.
 */
export interface ThermalInput {
  nx: number;
  ny: number;
  /** edge temperatures (°C) */
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** internal volumetric heat source term q/k (°C per cell²); 0 = none */
  source: number;
  /** source location as fractions 0..1 (a hot spot) */
  sx: number;
  sy: number;
  iterations?: number;
}

export interface ThermalResult {
  nx: number;
  ny: number;
  T: Float64Array; // row-major, length nx*ny
  min: number;
  max: number;
}

export function solveThermal(inp: ThermalInput): ThermalResult {
  const { nx, ny } = inp;
  const T = new Float64Array(nx * ny);
  const at = (i: number, j: number) => j * nx + i;

  // Initialise interior to the average edge temperature
  const avg = (inp.top + inp.bottom + inp.left + inp.right) / 4;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) T[at(i, j)] = avg;

  const setEdges = () => {
    for (let i = 0; i < nx; i++) {
      T[at(i, 0)] = inp.top;
      T[at(i, ny - 1)] = inp.bottom;
    }
    for (let j = 0; j < ny; j++) {
      T[at(0, j)] = inp.left;
      T[at(nx - 1, j)] = inp.right;
    }
  };
  setEdges();

  const si = Math.max(1, Math.min(nx - 2, Math.round(inp.sx * (nx - 1))));
  const sj = Math.max(1, Math.min(ny - 2, Math.round(inp.sy * (ny - 1))));
  const omega = 1.7; // SOR factor
  const iters = inp.iterations ?? 600;

  for (let k = 0; k < iters; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const src =
          inp.source !== 0 && Math.abs(i - si) <= 1 && Math.abs(j - sj) <= 1
            ? inp.source
            : 0;
        const gs =
          0.25 *
          (T[at(i - 1, j)] + T[at(i + 1, j)] + T[at(i, j - 1)] + T[at(i, j + 1)] + src);
        T[at(i, j)] += omega * (gs - T[at(i, j)]);
      }
    }
    setEdges();
  }

  let min = Infinity;
  let max = -Infinity;
  for (let idx = 0; idx < T.length; idx++) {
    if (T[idx] < min) min = T[idx];
    if (T[idx] > max) max = T[idx];
  }
  return { nx, ny, T, min, max };
}
