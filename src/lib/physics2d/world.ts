import { type Vec2, type AABB, aabbOverlap, vsub, vadd, vdot, vscale } from './math';
import { type Body, computeAABB } from './types';
import { collide, type Manifold } from './collide';
import {
  type Constraint,
  applySpringForce,
  solveDistance,
  solvePin,
} from './constraints';

export interface WorldOptions {
  gravity?: Vec2;
  iterations?: number;
  cellSize?: number;
  /** Velocity at which contacts stop being "bouncy" (Box2D-style) */
  restitutionThreshold?: number;
}

export interface WorldStats {
  bodies: number;
  pairs: number;
  contacts: number;
  awakeBodies: number;
}

const SLEEP_LIN_THRESHOLD = 0.4;
const SLEEP_ANG_THRESHOLD = 0.4;
const SLEEP_TIME = 0.5; // seconds

export class World {
  bodies: Body[] = [];
  constraints: Constraint[] = [];
  gravity: Vec2;
  iterations: number;
  cellSize: number;
  restitutionThreshold: number;
  /** Manifolds from the most recent step (debug rendering) */
  lastManifolds: Manifold[] = [];
  /** AABBs from the most recent step */
  lastAABBs = new Map<string, AABB>();
  /** Stats from most recent step */
  stats: WorldStats = { bodies: 0, pairs: 0, contacts: 0, awakeBodies: 0 };

  constructor(opts: WorldOptions = {}) {
    this.gravity = opts.gravity ?? { x: 0, y: 9.81 };
    this.iterations = opts.iterations ?? 8;
    this.cellSize = opts.cellSize ?? 2.0;
    this.restitutionThreshold = opts.restitutionThreshold ?? 1.0;
  }

  add(body: Body): Body {
    this.bodies.push(body);
    return body;
  }

  addConstraint(c: Constraint): Constraint {
    this.constraints.push(c);
    return c;
  }

  remove(id: string) {
    this.bodies = this.bodies.filter((b) => b.id !== id);
    this.constraints = this.constraints.filter(
      (c) => c.a.id !== id && (!c.b || c.b.id !== id),
    );
  }

  clear() {
    this.bodies = [];
    this.constraints = [];
    this.lastManifolds = [];
    this.lastAABBs.clear();
  }

  /**
   * Advance the simulation by `dt` seconds. dt is capped to prevent tunneling.
   */
  step(rawDt: number) {
    const dt = Math.min(rawDt, 1 / 30);

    // 1. Apply gravity + spring forces, integrate velocities (semi-implicit Euler)
    this.applyForces(dt);

    // 2. Broadphase: build spatial hash, find pairs
    this.lastAABBs.clear();
    for (const b of this.bodies) this.lastAABBs.set(b.id, computeAABB(b));
    const pairs = this.broadphase();

    // 3. Narrowphase: build manifolds
    const manifolds: Manifold[] = [];
    for (const [a, b] of pairs) {
      const m = collide(a, b);
      if (m) {
        manifolds.push(m);
        if (a.sleeping && !b.isStatic) a.sleeping = false;
        if (b.sleeping && !a.isStatic) b.sleeping = false;
      }
    }
    this.lastManifolds = manifolds;

    // 4. Sequential impulse solver: velocity constraints
    for (let iter = 0; iter < this.iterations; iter++) {
      for (const m of manifolds) this.solveContact(m);
      for (const c of this.constraints) {
        if (c.kind === 'distance') solveDistance(c);
        else if (c.kind === 'pin') solvePin(c);
      }
    }

    // 5. Integrate positions
    for (const b of this.bodies) {
      if (b.isStatic || b.sleeping) continue;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      if (!b.lockRotation) b.angle += b.angularVel * dt;
    }

    // 6. Position correction (split-impulse / Baumgarte) for deep penetrations
    this.positionCorrection(manifolds);

    // 7. Sleeping
    this.updateSleeping(dt);

    // Stats
    let awake = 0;
    for (const b of this.bodies) if (!b.sleeping && !b.isStatic) awake++;
    let contactCount = 0;
    for (const m of manifolds) contactCount += m.contacts.length;
    this.stats = {
      bodies: this.bodies.length,
      pairs: pairs.length,
      contacts: contactCount,
      awakeBodies: awake,
    };
  }

  private applyForces(dt: number) {
    for (const c of this.constraints) if (c.kind === 'spring') applySpringForce(c);
    for (const b of this.bodies) {
      if (b.isStatic || b.sleeping) {
        b.forceAccum.x = 0;
        b.forceAccum.y = 0;
        b.torqueAccum = 0;
        continue;
      }
      // gravity + accumulated forces
      const ax = this.gravity.x + b.forceAccum.x * b.invMass;
      const ay = this.gravity.y + b.forceAccum.y * b.invMass;
      b.vel.x += ax * dt;
      b.vel.y += ay * dt;
      if (!b.lockRotation) b.angularVel += b.torqueAccum * b.invInertia * dt;
      b.forceAccum.x = 0;
      b.forceAccum.y = 0;
      b.torqueAccum = 0;
    }
  }

  private broadphase(): Array<[Body, Body]> {
    // Spatial hash by AABB cell coverage
    const cellSize = this.cellSize;
    const grid = new Map<string, Body[]>();
    for (const b of this.bodies) {
      const a = this.lastAABBs.get(b.id)!;
      const i0 = Math.floor(a.minX / cellSize);
      const j0 = Math.floor(a.minY / cellSize);
      const i1 = Math.floor(a.maxX / cellSize);
      const j1 = Math.floor(a.maxY / cellSize);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = `${i},${j}`;
          let arr = grid.get(k);
          if (!arr) {
            arr = [];
            grid.set(k, arr);
          }
          arr.push(b);
        }
      }
    }
    const pairs: Array<[Body, Body]> = [];
    const seen = new Set<string>();
    for (const arr of grid.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          if (a.isStatic && b.isStatic) continue;
          if (a.sleeping && b.sleeping) continue;
          const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (
            !aabbOverlap(this.lastAABBs.get(a.id)!, this.lastAABBs.get(b.id)!)
          )
            continue;
          pairs.push([a, b]);
        }
      }
    }
    return pairs;
  }

  private solveContact(m: Manifold) {
    const { bodyA: A, bodyB: B, normal } = m;
    for (const contact of m.contacts) {
      const ra = vsub(contact.point, A.pos);
      const rb = vsub(contact.point, B.pos);

      // Relative velocity at contact (v + ω × r)
      const vA = {
        x: A.vel.x - A.angularVel * ra.y,
        y: A.vel.y + A.angularVel * ra.x,
      };
      const vB = {
        x: B.vel.x - B.angularVel * rb.y,
        y: B.vel.y + B.angularVel * rb.x,
      };
      const rv = { x: vB.x - vA.x, y: vB.y - vA.y };
      const velAlongNormal = rv.x * normal.x + rv.y * normal.y;
      if (velAlongNormal > 0) continue; // separating

      const e =
        Math.abs(velAlongNormal) < this.restitutionThreshold ? 0 : m.restitution;

      const raCrossN = ra.x * normal.y - ra.y * normal.x;
      const rbCrossN = rb.x * normal.y - rb.y * normal.x;
      const invMassSum =
        A.invMass +
        B.invMass +
        raCrossN * raCrossN * A.invInertia +
        rbCrossN * rbCrossN * B.invInertia;
      if (invMassSum === 0) continue;

      const j = -(1 + e) * velAlongNormal / invMassSum;
      const impulse = { x: normal.x * j, y: normal.y * j };

      this.applyImpulse(A, ra, { x: -impulse.x, y: -impulse.y });
      this.applyImpulse(B, rb, impulse);

      // Friction
      const vA2 = {
        x: A.vel.x - A.angularVel * ra.y,
        y: A.vel.y + A.angularVel * ra.x,
      };
      const vB2 = {
        x: B.vel.x - B.angularVel * rb.y,
        y: B.vel.y + B.angularVel * rb.x,
      };
      const rv2 = { x: vB2.x - vA2.x, y: vB2.y - vA2.y };
      // Tangent direction = rv2 - (rv2·n)*n, then normalized
      const vAlongN = rv2.x * normal.x + rv2.y * normal.y;
      const tan = { x: rv2.x - normal.x * vAlongN, y: rv2.y - normal.y * vAlongN };
      const tL = Math.hypot(tan.x, tan.y);
      if (tL < 1e-6) continue;
      tan.x /= tL;
      tan.y /= tL;

      const raCrossT = ra.x * tan.y - ra.y * tan.x;
      const rbCrossT = rb.x * tan.y - rb.y * tan.x;
      const invMassSumT =
        A.invMass +
        B.invMass +
        raCrossT * raCrossT * A.invInertia +
        rbCrossT * rbCrossT * B.invInertia;
      if (invMassSumT === 0) continue;

      const jt = -(vdot(rv2, tan)) / invMassSumT;
      // Coulomb friction cone: |jt| <= μ * |j|
      const mu = m.friction;
      const maxJt = Math.abs(j) * mu;
      const jtClamped = jt > maxJt ? maxJt : jt < -maxJt ? -maxJt : jt;
      const tImp = { x: tan.x * jtClamped, y: tan.y * jtClamped };
      this.applyImpulse(A, ra, { x: -tImp.x, y: -tImp.y });
      this.applyImpulse(B, rb, tImp);
    }
  }

  private applyImpulse(b: Body, r: Vec2, j: Vec2) {
    if (b.isStatic) return;
    b.vel.x += j.x * b.invMass;
    b.vel.y += j.y * b.invMass;
    if (!b.lockRotation) b.angularVel += (r.x * j.y - r.y * j.x) * b.invInertia;
  }

  private positionCorrection(manifolds: Manifold[]) {
    const PERCENT = 0.4;
    const SLOP = 0.01;
    for (const m of manifolds) {
      const A = m.bodyA;
      const B = m.bodyB;
      const invMassSum = A.invMass + B.invMass;
      if (invMassSum === 0) continue;
      // Use max-depth contact for correction
      let maxDepth = 0;
      for (const c of m.contacts) if (c.depth > maxDepth) maxDepth = c.depth;
      const correction = (Math.max(maxDepth - SLOP, 0) / invMassSum) * PERCENT;
      const cx = m.normal.x * correction;
      const cy = m.normal.y * correction;
      if (!A.isStatic) {
        A.pos.x -= cx * A.invMass;
        A.pos.y -= cy * A.invMass;
      }
      if (!B.isStatic) {
        B.pos.x += cx * B.invMass;
        B.pos.y += cy * B.invMass;
      }
    }
  }

  private updateSleeping(dt: number) {
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      const linSq = b.vel.x * b.vel.x + b.vel.y * b.vel.y;
      const ang = Math.abs(b.angularVel);
      if (linSq < SLEEP_LIN_THRESHOLD * SLEEP_LIN_THRESHOLD && ang < SLEEP_ANG_THRESHOLD) {
        b.sleepTimer += dt;
        if (b.sleepTimer > SLEEP_TIME) {
          b.sleeping = true;
          b.vel.x = 0;
          b.vel.y = 0;
          b.angularVel = 0;
        }
      } else {
        b.sleepTimer = 0;
        b.sleeping = false;
      }
    }
  }

  /** Apply an impulse to a body's center (for AI tool / mouse interaction). */
  applyForce(body: Body, force: Vec2) {
    if (body.isStatic) return;
    body.forceAccum.x += force.x;
    body.forceAccum.y += force.y;
    body.sleeping = false;
    body.sleepTimer = 0;
  }
}

// suppress unused-warn from re-export
void vadd;
void vscale;
