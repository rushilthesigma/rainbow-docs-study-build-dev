/**
 * Simple-mode aero analytics. The model assumptions are deliberately limited:
 *
 *   Cl = 2π sin(α)               (thin-airfoil theory, valid for small α)
 *        + camber-line zero-lift offset α_0 for cambered NACA shapes
 *   Cl → clamps to a stall plateau at |α| > α_stall (≈ 15°)
 *   Cd = Cd0 + k·Cl²              (parabolic drag polar with induced-drag term)
 *   Re = ρ·V·c / μ
 *
 * These are textbook approximations — useful for intuition, not for design.
 */

import { getAirfoil, type AirfoilId } from './naca';

export interface AeroInputs {
  airfoil: AirfoilId;
  /** angle of attack in radians */
  aoa: number;
  /** freestream velocity m/s */
  V: number;
  /** density kg/m³ */
  rho: number;
  /** chord length m */
  chord: number;
  /** dynamic viscosity Pa·s — air at 15 °C */
  mu?: number;
  /** Override the zero-lift angle (radians) — used by custom NACA shapes */
  alphaZero?: number;
  /** Override the zero-AoA drag coefficient — used by custom NACA shapes */
  cd0?: number;
}

export interface AeroResults {
  cl: number;
  cd: number;
  /** L/D ratio (0 if Cd → 0) */
  ld: number;
  re: number;
  lift: number;
  drag: number;
  stalled: boolean;
  alphaZeroDeg: number;
}

const MU_AIR = 1.81e-5;
const STALL_DEG = 15;

export function alphaZeroLift(airfoil: AirfoilId): number {
  // Approximate: NACA M-P-XX has α_0 ≈ -1.07·M (degrees) per thin-airfoil theory.
  if (airfoil === 'flat' || airfoil === 'cylinder' || airfoil === 'naca0012') return 0;
  const m = parseFloat(airfoil[4]) / 100; // 2 or 4
  return (-1.07 * m * 100) * (Math.PI / 180);
}

export function aero(input: AeroInputs): AeroResults {
  const { airfoil, aoa, V, rho, chord } = input;
  const mu = input.mu ?? MU_AIR;
  const preset = getAirfoil(airfoil);
  const a0 = input.alphaZero ?? alphaZeroLift(airfoil);
  const aEff = aoa - a0;
  const stalled = Math.abs(aoa) * (180 / Math.PI) > STALL_DEG;

  let cl: number;
  if (airfoil === 'cylinder') {
    cl = 0; // ideal cylinder produces no lift unless we spin it (Magnus)
  } else if (!stalled) {
    cl = 2 * Math.PI * Math.sin(aEff);
  } else {
    // Past stall: gradually drop toward 0 — crude post-stall model
    const sign = Math.sign(aoa);
    const over = Math.abs(aoa) - (STALL_DEG * Math.PI) / 180;
    const peak = 2 * Math.PI * Math.sin((STALL_DEG * Math.PI) / 180 - a0 * sign);
    cl = sign * Math.max(0, peak * Math.exp(-over * 3));
  }

  const k = airfoil === 'cylinder' ? 0 : 0.04; // induced drag factor (effective aspect ratio fudge)
  const cd0 = input.cd0 ?? preset.cd0;
  let cd = cd0 + k * cl * cl;
  if (stalled) cd += 0.6 * (Math.abs(aoa) - (STALL_DEG * Math.PI) / 180);

  const re = (rho * Math.abs(V) * chord) / mu;
  const q = 0.5 * rho * V * V;
  const lift = q * chord * cl;
  const drag = q * chord * cd;
  const ld = cd > 1e-6 ? cl / cd : 0;
  return { cl, cd, ld, re, lift, drag, stalled, alphaZeroDeg: a0 * (180 / Math.PI) };
}
