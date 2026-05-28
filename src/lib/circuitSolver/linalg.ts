/**
 * Hand-written dense linear-algebra primitives. Used by the MNA solver in
 * `solver.ts` — we LU-decompose the system matrix in place and back-substitute.
 *
 * Matrices are row-major Float64Arrays of length n*n.
 */

export type Matrix = Float64Array;
export type Vector = Float64Array;

export function mat(n: number): Matrix {
  return new Float64Array(n * n);
}

export const at = (A: Matrix, n: number, i: number, j: number): number => A[i * n + j];
export const set = (A: Matrix, n: number, i: number, j: number, v: number): void => {
  A[i * n + j] = v;
};
export const add = (A: Matrix, n: number, i: number, j: number, v: number): void => {
  A[i * n + j] += v;
};

/**
 * Solve A·x = b for x in place using partial-pivot LU decomposition.
 * Throws if the matrix is singular.
 */
export function solve(A: Matrix, b: Vector, n: number): Vector {
  // Copy so we don't trash the caller's matrix
  const M = new Float64Array(A);
  const rhs = new Float64Array(b);
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;

  for (let k = 0; k < n; k++) {
    // Partial pivot — find row r ≥ k with max |M[r,k]|
    let maxR = k;
    let maxV = Math.abs(M[k * n + k]);
    for (let r = k + 1; r < n; r++) {
      const v = Math.abs(M[r * n + k]);
      if (v > maxV) {
        maxV = v;
        maxR = r;
      }
    }
    if (maxV < 1e-14) throw new Error('Singular matrix');
    if (maxR !== k) {
      // swap rows
      for (let j = 0; j < n; j++) {
        const t = M[k * n + j];
        M[k * n + j] = M[maxR * n + j];
        M[maxR * n + j] = t;
      }
      const t = rhs[k];
      rhs[k] = rhs[maxR];
      rhs[maxR] = t;
      const tp = piv[k];
      piv[k] = piv[maxR];
      piv[maxR] = tp;
    }
    const pivot = M[k * n + k];
    for (let r = k + 1; r < n; r++) {
      const f = M[r * n + k] / pivot;
      M[r * n + k] = 0;
      for (let j = k + 1; j < n; j++) M[r * n + j] -= f * M[k * n + j];
      rhs[r] -= f * rhs[k];
    }
  }

  // Back-substitute
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j];
    x[i] = s / M[i * n + i];
  }
  return x;
}
