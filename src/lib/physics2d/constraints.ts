import { type Vec2, vsub, vadd, rotate, vcrossSV } from './math';
import type { Body } from './types';

export type ConstraintKind = 'distance' | 'spring' | 'pin';

export interface BaseConstraint {
  id: string;
  kind: ConstraintKind;
  a: Body;
  b: Body | null;
  /** Anchor in A's local space (relative to body's centroid, pre-rotation) */
  anchorA: Vec2;
  /** Anchor in B's local space (or world point if b is null) */
  anchorB: Vec2;
}

export interface DistanceConstraint extends BaseConstraint {
  kind: 'distance';
  restLength: number;
}

export interface SpringConstraint extends BaseConstraint {
  kind: 'spring';
  restLength: number;
  stiffness: number;
  damping: number;
}

export interface PinConstraint extends BaseConstraint {
  kind: 'pin';
}

export type Constraint = DistanceConstraint | SpringConstraint | PinConstraint;

let cseq = 1;
const cid = () => `c-${(cseq++).toString(36)}`;

export function makeDistance(
  a: Body,
  b: Body | null,
  anchorA: Vec2,
  anchorB: Vec2,
  restLength?: number,
): DistanceConstraint {
  const wa = worldAnchor(a, anchorA);
  const wb = b ? worldAnchor(b, anchorB) : anchorB;
  return {
    id: cid(),
    kind: 'distance',
    a,
    b,
    anchorA,
    anchorB,
    restLength: restLength ?? Math.hypot(wb.x - wa.x, wb.y - wa.y),
  };
}

export function makeSpring(
  a: Body,
  b: Body | null,
  anchorA: Vec2,
  anchorB: Vec2,
  stiffness = 80,
  damping = 1,
  restLength?: number,
): SpringConstraint {
  const wa = worldAnchor(a, anchorA);
  const wb = b ? worldAnchor(b, anchorB) : anchorB;
  return {
    id: cid(),
    kind: 'spring',
    a,
    b,
    anchorA,
    anchorB,
    restLength: restLength ?? Math.hypot(wb.x - wa.x, wb.y - wa.y),
    stiffness,
    damping,
  };
}

export function makePin(a: Body, b: Body | null, anchorA: Vec2, anchorB: Vec2): PinConstraint {
  return { id: cid(), kind: 'pin', a, b, anchorA, anchorB };
}

export function worldAnchor(body: Body, local: Vec2): Vec2 {
  const r = rotate(local, body.angle);
  return { x: body.pos.x + r.x, y: body.pos.y + r.y };
}

/** Apply spring force directly (Hookean F = -k(d - rest) - c·v_rel along axis) */
export function applySpringForce(s: SpringConstraint) {
  const wa = worldAnchor(s.a, s.anchorA);
  const wb = s.b ? worldAnchor(s.b, s.anchorB) : s.anchorB;
  const d = vsub(wb, wa);
  const L = Math.hypot(d.x, d.y) || 0.0001;
  const nx = d.x / L;
  const ny = d.y / L;
  const stretch = L - s.restLength;

  // Relative velocity along the spring axis at the anchor points
  const ra = vsub(wa, s.a.pos);
  const va = vadd(s.a.vel, vcrossSV(s.a.angularVel, ra));
  let vbAtAnchor: Vec2 = { x: 0, y: 0 };
  if (s.b) {
    const rb = vsub(wb, s.b.pos);
    vbAtAnchor = vadd(s.b.vel, vcrossSV(s.b.angularVel, rb));
  }
  const vRelAxis = (vbAtAnchor.x - va.x) * nx + (vbAtAnchor.y - va.y) * ny;
  const forceMag = s.stiffness * stretch + s.damping * vRelAxis;
  const fx = nx * forceMag;
  const fy = ny * forceMag;
  // Apply to A in +n direction, to B in -n direction (pulling A toward B if stretched)
  if (!s.a.isStatic) {
    s.a.forceAccum.x += fx;
    s.a.forceAccum.y += fy;
    const rax = wa.x - s.a.pos.x;
    const ray = wa.y - s.a.pos.y;
    s.a.torqueAccum += rax * fy - ray * fx;
  }
  if (s.b && !s.b.isStatic) {
    s.b.forceAccum.x -= fx;
    s.b.forceAccum.y -= fy;
    const rbx = wb.x - s.b.pos.x;
    const rby = wb.y - s.b.pos.y;
    s.b.torqueAccum -= rbx * fy - rby * fx;
  }
}

/** Velocity-level distance/pin constraint solve. Returns the impulse magnitude applied. */
export function solveDistance(c: DistanceConstraint | PinConstraint): void {
  solveDistanceLike(c, c.kind === 'pin' ? 0 : c.restLength);
}

function solveDistanceLike(c: BaseConstraint, restLength: number) {
  const wa = worldAnchor(c.a, c.anchorA);
  const wb = c.b ? worldAnchor(c.b, c.anchorB) : c.anchorB;
  const d = vsub(wb, wa);
  const L = Math.hypot(d.x, d.y);
  if (L < 1e-6 && restLength <= 0) return;
  const nx = (d.x / (L || 1));
  const ny = (d.y / (L || 1));

  const ra = vsub(wa, c.a.pos);
  const va = vadd(c.a.vel, vcrossSV(c.a.angularVel, ra));
  let vb: Vec2 = { x: 0, y: 0 };
  let rb: Vec2 = { x: 0, y: 0 };
  if (c.b) {
    rb = vsub(wb, c.b.pos);
    vb = vadd(c.b.vel, vcrossSV(c.b.angularVel, rb));
  }
  const vRel = (vb.x - va.x) * nx + (vb.y - va.y) * ny;

  const raCrossN = ra.x * ny - ra.y * nx;
  const rbCrossN = c.b ? rb.x * ny - rb.y * nx : 0;
  const invMassSum =
    c.a.invMass +
    raCrossN * raCrossN * c.a.invInertia +
    (c.b ? c.b.invMass + rbCrossN * rbCrossN * c.b.invInertia : 0);
  if (invMassSum === 0) return;

  // Baumgarte for position drift
  const bias = -0.2 * (L - restLength);
  const lambda = -(vRel + bias) / invMassSum;

  const ix = lambda * nx;
  const iy = lambda * ny;
  if (!c.a.isStatic) {
    c.a.vel.x -= ix * c.a.invMass;
    c.a.vel.y -= iy * c.a.invMass;
    if (!c.a.lockRotation) c.a.angularVel -= (ra.x * iy - ra.y * ix) * c.a.invInertia;
  }
  if (c.b && !c.b.isStatic) {
    c.b.vel.x += ix * c.b.invMass;
    c.b.vel.y += iy * c.b.invMass;
    if (!c.b.lockRotation) c.b.angularVel += (rb.x * iy - rb.y * ix) * c.b.invInertia;
  }
}

export function solvePin(c: PinConstraint): void {
  // Pin: keep anchor points coincident — same as distance with rest length 0,
  // but iterate both x and y components.
  const wa = worldAnchor(c.a, c.anchorA);
  const wb = c.b ? worldAnchor(c.b, c.anchorB) : c.anchorB;
  const dx = wb.x - wa.x;
  const dy = wb.y - wa.y;
  const ra = { x: wa.x - c.a.pos.x, y: wa.y - c.a.pos.y };
  let rb = { x: 0, y: 0 };
  if (c.b) rb = { x: wb.x - c.b.pos.x, y: wb.y - c.b.pos.y };

  // Solve once along the (dx, dy) direction
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const nx = dx / len;
  const ny = dy / len;

  const va = vadd(c.a.vel, vcrossSV(c.a.angularVel, ra));
  let vb: Vec2 = { x: 0, y: 0 };
  if (c.b) vb = vadd(c.b.vel, vcrossSV(c.b.angularVel, rb));
  const vRel = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
  const raCrossN = ra.x * ny - ra.y * nx;
  const rbCrossN = c.b ? rb.x * ny - rb.y * nx : 0;
  const invMassSum =
    c.a.invMass +
    raCrossN * raCrossN * c.a.invInertia +
    (c.b ? c.b.invMass + rbCrossN * rbCrossN * c.b.invInertia : 0);
  if (invMassSum === 0) return;
  const bias = -0.2 * len;
  const lambda = -(vRel + bias) / invMassSum;
  const ix = lambda * nx;
  const iy = lambda * ny;
  if (!c.a.isStatic) {
    c.a.vel.x -= ix * c.a.invMass;
    c.a.vel.y -= iy * c.a.invMass;
    if (!c.a.lockRotation) c.a.angularVel -= (ra.x * iy - ra.y * ix) * c.a.invInertia;
  }
  if (c.b && !c.b.isStatic) {
    c.b.vel.x += ix * c.b.invMass;
    c.b.vel.y += iy * c.b.invMass;
    if (!c.b.lockRotation) c.b.angularVel += (rb.x * iy - rb.y * ix) * c.b.invInertia;
  }
}

