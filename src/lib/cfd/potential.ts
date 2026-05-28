/**
 * Approximate 2D potential-flow velocity field around an airfoil. We model the
 * body as the superposition of:
 *
 *   - uniform freestream V (rotated by AoA)
 *   - a doublet at the quarter-chord representing displacement thickness
 *   - a clockwise vortex of circulation Γ chosen to satisfy Kutta condition,
 *     i.e. Γ = π · c · V · sin(α) — gives the correct lift slope.
 *
 * This is NOT a true panel-method solve, but produces streamlines that
 * visibly stagnate near the leading edge, accelerate over the upper surface,
 * and bend the wake downward — which is exactly the visualization we need
 * for a Fusion-360-style "Simple mode" feel.
 */

import type { Vec2 } from '../physics2d/math';

export interface FlowParams {
  /** Freestream velocity magnitude m/s (the freestream direction is +x, AoA is applied to the body) */
  V: number;
  /** Angle of attack in radians (body pitched by this; freestream stays +x) */
  aoa: number;
  /** Chord length m */
  chord: number;
  /** Body kind affects doublet strength */
  isCylinder: boolean;
  /** Body center (quarter-chord) world position */
  center: Vec2;
}

export interface FlowField {
  /** Evaluate the velocity at a point in world space */
  velocity(p: Vec2): Vec2;
}

export function makeFlowField(p: FlowParams): FlowField {
  const c = p.chord;
  const V = p.V;
  // Doublet strength: μ = 2π·V·R² for a cylinder of radius R giving a clean
  // cylinder pattern. For airfoils we shrink to a fraction of chord.
  const R = p.isCylinder ? c / 2 : c * 0.18;
  const mu = 2 * Math.PI * V * R * R;
  // Kutta circulation: Γ = π·c·V·sin(α)·-1 (clockwise positive lift).
  const Gamma = p.isCylinder ? 0 : -Math.PI * c * V * Math.sin(p.aoa);

  return {
    velocity(point: Vec2): Vec2 {
      // Translate to body-centered coords, then rotate by -aoa to align with airfoil chord-line.
      const dx = point.x - p.center.x;
      const dy = point.y - p.center.y;
      const ca = Math.cos(-p.aoa);
      const sa = Math.sin(-p.aoa);
      const lx = dx * ca - dy * sa;
      const ly = dx * sa + dy * ca;

      // Freestream in body frame
      const ufx = V * Math.cos(-p.aoa);
      const ufy = V * Math.sin(-p.aoa);
      // Doublet (axis aligned with +x): (μ / 2π) · (x²−y²)/(x²+y²)² etc.
      const r2 = lx * lx + ly * ly;
      let udx = 0,
        udy = 0,
        uvx = 0,
        uvy = 0;
      if (r2 > 1e-6) {
        const denom = r2 * r2;
        udx = (-mu / (2 * Math.PI)) * (lx * lx - ly * ly) / denom;
        udy = (-mu / (2 * Math.PI)) * (2 * lx * ly) / denom;
        // Vortex: u = -Γ/(2π) · y/r², v = Γ/(2π) · x/r²
        const k = Gamma / (2 * Math.PI);
        uvx = -k * ly / r2;
        uvy = k * lx / r2;
      }
      const totalLocalX = ufx + udx + uvx;
      const totalLocalY = ufy + udy + uvy;

      // Rotate back to world frame
      const wx = totalLocalX * Math.cos(p.aoa) - totalLocalY * Math.sin(p.aoa);
      const wy = totalLocalX * Math.sin(p.aoa) + totalLocalY * Math.cos(p.aoa);
      return { x: wx, y: wy };
    },
  };
}

/**
 * Advance a particle through a flow field by classic RK2 — gives smoother
 * streamlines than Euler at the same step count.
 */
export function advectRK2(field: FlowField, p: Vec2, dt: number): Vec2 {
  const k1 = field.velocity(p);
  const mid = { x: p.x + k1.x * dt * 0.5, y: p.y + k1.y * dt * 0.5 };
  const k2 = field.velocity(mid);
  return { x: p.x + k2.x * dt, y: p.y + k2.y * dt };
}
