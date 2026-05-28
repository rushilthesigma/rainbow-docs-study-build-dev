/**
 * NACA 4-digit airfoil generator + a few simple shape presets (flat plate, cylinder).
 *
 * Given chord length c and the 4-digit code MPXX, the camber line is:
 *   yc(x) = (M/P²)(2Px − x²)            for 0 ≤ x ≤ Pc
 *   yc(x) = (M/(1-P)²)((1 − 2P) + 2Px − x²)  for Pc ≤ x ≤ c
 * with thickness distribution:
 *   yt(x) = (T/0.2) * (0.2969√x − 0.1260x − 0.3516x² + 0.2843x³ − 0.1015x⁴)
 *
 * Surface points are camber ± thickness rotated by the camber-line angle.
 */

import type { Vec2 } from '../physics2d/math';

export type AirfoilId = 'flat' | 'naca0012' | 'naca2412' | 'naca4412' | 'cylinder';

export interface AirfoilPreset {
  id: AirfoilId;
  label: string;
  /** Empirical Cd at zero AoA, used by the simple-mode analytics */
  cd0: number;
}

export const AIRFOILS: AirfoilPreset[] = [
  { id: 'naca0012', label: 'NACA 0012', cd0: 0.008 },
  { id: 'naca2412', label: 'NACA 2412', cd0: 0.009 },
  { id: 'naca4412', label: 'NACA 4412', cd0: 0.011 },
  { id: 'flat', label: 'Flat Plate', cd0: 0.005 },
  { id: 'cylinder', label: 'Cylinder', cd0: 1.2 },
];

export function getAirfoil(id: AirfoilId): AirfoilPreset {
  return AIRFOILS.find((a) => a.id === id) ?? AIRFOILS[0];
}

/**
 * Generate a closed polyline of the airfoil surface (CCW) at unit chord length.
 * Returns roughly 2*samples + 1 vertices.
 */
export function generateAirfoil(id: AirfoilId, samples = 60): Vec2[] {
  if (id === 'flat') return flatPlate();
  if (id === 'cylinder') return cylinder(samples * 2);
  const m = parseFloat(id[4]) / 100;
  const p = parseFloat(id[5]) / 10;
  const t = parseFloat(id.slice(6)) / 100;
  return naca4(m, p, t, samples);
}

/** Public NACA 4-digit generator from raw M/P/T values (each 0..1 scale). */
export function naca4Custom(m: number, p: number, t: number, samples = 60): Vec2[] {
  return naca4(m, p, t, samples);
}

function naca4(m: number, p: number, t: number, samples: number): Vec2[] {
  const upper: Vec2[] = [];
  const lower: Vec2[] = [];
  // Cosine spacing: more points near LE and TE
  for (let i = 0; i <= samples; i++) {
    const beta = (Math.PI * i) / samples;
    const x = 0.5 * (1 - Math.cos(beta));
    const yt = thicknessY(x, t);
    let yc = 0;
    let dydx = 0;
    if (p > 0 && m > 0) {
      if (x < p) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dydx = ((2 * m) / (p * p)) * (p - x);
      } else {
        yc = (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x);
        dydx = ((2 * m) / ((1 - p) * (1 - p))) * (p - x);
      }
    }
    const theta = Math.atan(dydx);
    const sx = Math.sin(theta);
    const cx = Math.cos(theta);
    upper.push({ x: x - yt * sx, y: yc + yt * cx });
    lower.push({ x: x + yt * sx, y: yc - yt * cx });
  }
  // Close: walk upper LE→TE, then lower TE→LE (skip the duplicate TE/LE points)
  return [...upper, ...lower.slice(0, -1).reverse()];
}

function thicknessY(x: number, t: number): number {
  if (x <= 0) return 0;
  return (
    (t / 0.2) *
    (0.2969 * Math.sqrt(x) -
      0.1260 * x -
      0.3516 * x * x +
      0.2843 * x * x * x -
      // Use 0.1036 for a closed trailing edge instead of 0.1015 (which leaves a small gap).
      0.1036 * x * x * x * x)
  );
}

function flatPlate(): Vec2[] {
  const t = 0.005;
  return [
    { x: 0, y: -t },
    { x: 1, y: -t },
    { x: 1, y: t },
    { x: 0, y: t },
  ];
}

function cylinder(samples: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const th = (i / samples) * 2 * Math.PI;
    out.push({ x: 0.5 + 0.5 * Math.cos(th), y: 0.5 * Math.sin(th) });
  }
  return out;
}

/** Translate + scale + rotate a unit-chord shape into a placed body in 2D space. */
export function placeShape(
  shape: Vec2[],
  pos: Vec2,
  chord: number,
  aoaRad: number,
): Vec2[] {
  // Rotate around 1/4-chord pivot to match aerodynamic convention.
  const px = 0.25;
  const py = 0;
  const c = Math.cos(-aoaRad);
  const s = Math.sin(-aoaRad);
  return shape.map((v) => {
    const dx = v.x - px;
    const dy = v.y - py;
    return {
      x: pos.x + chord * (dx * c - dy * s),
      y: pos.y + chord * (dx * s + dy * c),
    };
  });
}
