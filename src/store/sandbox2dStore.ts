import { create } from 'zustand';
import { World } from '@/lib/physics2d/world';
import { makeBody, makeCircle, makePolygonFromVertices, type Body } from '@/lib/physics2d/types';

export type Tool =
  | 'select'
  | 'pan'
  | 'resize'
  | 'draw'
  | 'circle'
  | 'box'
  | 'water'
  | 'spring'
  | 'hinge'
  | 'motor'
  | 'tracer'
  | 'eraser'
  | 'push'
  | 'rotate';

export type GridStyle = 'lines' | 'dots' | 'none';

export interface WaterParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  density: number;
  pressure: number;
}

export interface MotorData {
  bodyId: string;
  speed: number;
  torque: number;
  active: boolean;
}

export interface TracerData {
  bodyId: string;
  points: { x: number; y: number }[];
  /** stroke color (any CSS color, incl. rgba) */
  color: string;
  /** stroke width in world meters (~ pixels at zoom = 1 / BASE_SCALE) */
  width: number;
  /** max points to keep — older points fall off the tail */
  maxPoints: number;
}

export const DEFAULT_TRACER_COLOR = '#fbbf24';
export const DEFAULT_TRACER_WIDTH = 0.06;
export const DEFAULT_TRACER_LEN = 500;

// ─── SPH constants ────────────────────────────────────────────────────────────
const SPH_H = 0.28;
const SPH_H2 = SPH_H * SPH_H;
const SPH_REST = 28;
const SPH_K = 2.2;
const SPH_VISC = 0.18;
const SPH_MASS = 0.025;
const SPH_POLY6 = 315 / (64 * Math.PI * SPH_H ** 9);
const SPH_SPIKY = -45 / (Math.PI * SPH_H ** 6);
const SPH_VIS_LAP = 45 / (Math.PI * SPH_H ** 6);

// ─── Graham scan convex hull ──────────────────────────────────────────────────
export function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  let anchor = 0;
  for (let i = 1; i < pts.length; i++) {
    if (
      pts[i].y > pts[anchor].y ||
      (pts[i].y === pts[anchor].y && pts[i].x < pts[anchor].x)
    )
      anchor = i;
  }
  const { x: ax, y: ay } = pts[anchor];
  const rest = pts.filter((_, i) => i !== anchor);
  rest.sort((a, b) => {
    const angA = Math.atan2(a.y - ay, a.x - ax);
    const angB = Math.atan2(b.y - ay, b.x - ax);
    if (angA !== angB) return angA - angB;
    return (a.x - ax) ** 2 + (a.y - ay) ** 2 - ((b.x - ax) ** 2 + (b.y - ay) ** 2);
  });
  const hull: typeof pts = [pts[anchor]];
  for (const p of rest) {
    while (hull.length >= 2) {
      const a2 = hull[hull.length - 2];
      const b2 = hull[hull.length - 1];
      if ((b2.x - a2.x) * (p.y - a2.y) - (b2.y - a2.y) * (p.x - a2.x) <= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull.length >= 3 ? hull : pts.slice(0, 3);
}

// ─── Douglas-Peucker path simplification ──────────────────────────────────────
export function dpSimplify(
  pts: { x: number; y: number }[],
  eps: number,
): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy) || 1;
  let maxD = 0;
  let maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - first.x) * dy - (pts[i].y - first.y) * dx) / len;
    if (d > maxD) {
      maxD = d;
      maxI = i;
    }
  }
  if (maxD > eps) {
    const a = dpSimplify(pts.slice(0, maxI + 1), eps);
    const b = dpSimplify(pts.slice(maxI), eps);
    return [...a.slice(0, -1), ...b];
  }
  return [first, last];
}

// ─── SPH step ─────────────────────────────────────────────────────────────────
export function sphStep(
  particles: WaterParticle[],
  bodies: Body[],
  gravity: { x: number; y: number },
  dt: number,
) {
  const n = particles.length;
  if (n === 0) return;

  // Spatial hash (numeric key)
  const cellSz = SPH_H;
  const grid = new Map<number, number[]>();
  const PRIME = 100003;
  for (let i = 0; i < n; i++) {
    const p = particles[i];
    const cx = Math.floor(p.x / cellSz);
    const cy = Math.floor(p.y / cellSz);
    const k = cx * PRIME + cy;
    let cell = grid.get(k);
    if (!cell) {
      cell = [];
      grid.set(k, cell);
    }
    cell.push(i);
  }

  function neighbors(x: number, y: number): number[] {
    const cx = Math.floor(x / cellSz);
    const cy = Math.floor(y / cellSz);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get((cx + dx) * PRIME + (cy + dy));
        if (cell) for (const idx of cell) out.push(idx);
      }
    return out;
  }

  // Density pass
  for (let i = 0; i < n; i++) {
    const p = particles[i];
    let rho = 0;
    for (const j of neighbors(p.x, p.y)) {
      const q = particles[j];
      const r2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (r2 < SPH_H2) {
        const w = SPH_H2 - r2;
        rho += SPH_MASS * SPH_POLY6 * w * w * w;
      }
    }
    p.density = Math.max(rho, 0.001);
    p.pressure = Math.max(0, SPH_K * (p.density - SPH_REST));
  }

  // Force + integration pass
  for (let i = 0; i < n; i++) {
    const p = particles[i];
    let ax = gravity.x;
    let ay = gravity.y;

    for (const j of neighbors(p.x, p.y)) {
      if (j === i) continue;
      const q = particles[j];
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const r = Math.hypot(dx, dy);
      if (r < SPH_H && r > 0.001) {
        const hr = SPH_H - r;
        // Pressure (Spiky gradient)
        const pf =
          (-SPH_MASS * (p.pressure + q.pressure)) /
          (2 * q.density) *
          SPH_SPIKY *
          hr * hr / r;
        ax += (pf * dx) / p.density;
        ay += (pf * dy) / p.density;
        // Viscosity (Laplacian)
        const vf = (SPH_VISC * SPH_MASS * SPH_VIS_LAP * hr) / (p.density * q.density);
        ax += vf * (q.vx - p.vx);
        ay += vf * (q.vy - p.vy);
      }
    }

    p.vx += ax * dt;
    p.vy += ay * dt;
    p.vx *= 0.999;
    p.vy *= 0.999;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Speed cap
    const spd2 = p.vx * p.vx + p.vy * p.vy;
    if (spd2 > 144) {
      const f = 12 / Math.sqrt(spd2);
      p.vx *= f;
      p.vy *= f;
    }
  }

  // Rigid body collision
  for (const body of bodies) {
    if (body.shape.kind === 'circle') {
      const R = body.shape.radius + 0.09;
      const R2 = R * R;
      for (const p of particles) {
        const dx = p.x - body.pos.x;
        const dy = p.y - body.pos.y;
        const r2 = dx * dx + dy * dy;
        if (r2 < R2 && r2 > 1e-6) {
          const r = Math.sqrt(r2);
          const nx = dx / r;
          const ny = dy / r;
          p.x = body.pos.x + nx * R;
          p.y = body.pos.y + ny * R;
          const vn = p.vx * nx + p.vy * ny;
          if (vn < 0) {
            p.vx -= 1.4 * vn * nx;
            p.vy -= 1.4 * vn * ny;
          }
        }
      }
    } else {
      const ca = Math.cos(body.angle);
      const sa = Math.sin(body.angle);
      const cna = Math.cos(-body.angle);
      const sna = Math.sin(-body.angle);
      const verts = body.shape.vertices;
      const norms = body.shape.normals;
      const nv = verts.length;
      const MARGIN = 0.1;

      for (const p of particles) {
        const dx = p.x - body.pos.x;
        const dy = p.y - body.pos.y;
        const lx = dx * cna - dy * sna;
        const ly = dx * sna + dy * cna;

        let inside = true;
        let minSep = Infinity;
        let bnx = 0;
        let bny = 0;

        for (let k = 0; k < nv; k++) {
          const nm = norms[k];
          const sep = (lx - verts[k].x) * nm.x + (ly - verts[k].y) * nm.y;
          if (sep > MARGIN) {
            inside = false;
            break;
          }
          if (-sep < minSep) {
            minSep = -sep;
            bnx = nm.x;
            bny = nm.y;
          }
        }

        if (inside) {
          const pen = minSep + MARGIN;
          const wnx = bnx * ca - bny * sa;
          const wny = bnx * sa + bny * ca;
          p.x += wnx * pen;
          p.y += wny * pen;
          const vn = p.vx * wnx + p.vy * wny;
          if (vn < 0) {
            p.vx -= 1.4 * vn * wnx;
            p.vy -= 1.4 * vn * wny;
          }
        }
      }
    }
  }
}

let particleSeq = 0;

export function makeWaterParticles(
  x: number,
  y: number,
  count: number,
): WaterParticle[] {
  const out: WaterParticle[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: ++particleSeq,
      x: x + (Math.random() - 0.5) * 0.25,
      y: y + (Math.random() - 0.5) * 0.25,
      vx: (Math.random() - 0.5) * 0.3,
      vy: Math.random() * 0.2,
      density: SPH_REST,
      pressure: 0,
    });
  }
  return out;
}

// ─── Hit-test ─────────────────────────────────────────────────────────────────
export function findBodyAt(world: World, wx: number, wy: number): Body | null {
  for (let i = world.bodies.length - 1; i >= 0; i--) {
    const b = world.bodies[i];
    if (b.shape.kind === 'circle') {
      const dx = wx - b.pos.x;
      const dy = wy - b.pos.y;
      if (dx * dx + dy * dy <= b.shape.radius * b.shape.radius) return b;
    } else {
      const c = Math.cos(-b.angle);
      const s = Math.sin(-b.angle);
      const lx = (wx - b.pos.x) * c - (wy - b.pos.y) * s;
      const ly = (wx - b.pos.x) * s + (wy - b.pos.y) * c;
      const verts = b.shape.vertices;
      let inside = true;
      for (let j = 0; j < verts.length; j++) {
        const a2 = verts[j];
        const b2 = verts[(j + 1) % verts.length];
        if ((b2.x - a2.x) * (ly - a2.y) - (b2.y - a2.y) * (lx - a2.x) < 0) {
          inside = false;
          break;
        }
      }
      if (inside) return b;
    }
  }
  return null;
}

// ─── History / rewind ─────────────────────────────────────────────────────────
const MAX_HISTORY = 900; // ~30 s at 30 snapshots/sec

interface BodySnapshot {
  id: string; px: number; py: number;
  vx: number; vy: number; angle: number; av: number;
}
interface PhysicsFrame {
  bodies: BodySnapshot[];
  particles: { x: number; y: number; vx: number; vy: number }[];
}

// ─── Store ────────────────────────────────────────────────────────────────────
interface Sandbox2DState {
  world: World;
  running: boolean;
  timeScale: number;
  tool: Tool;
  selectedId: string | null;
  currentColor: string;
  rev: number;
  particles: WaterParticle[];
  motors: Map<string, MotorData>;
  tracers: Map<string, TracerData>;

  // Canvas settings
  snapEnabled: boolean;
  snapSize: number;
  bgColor: string;
  gridVisible: boolean;
  gridColor: string;
  gridStyle: GridStyle;
  gridSize: number;

  setTool: (t: Tool) => void;
  setRunning: (b: boolean) => void;
  toggleRunning: () => void;
  setTimeScale: (s: number) => void;
  setSelected: (id: string | null) => void;
  setColor: (c: string) => void;
  addBody: (body: Body) => void;
  mutate: (fn: (w: World) => void) => void;
  addParticles: (ps: WaterParticle[]) => void;
  clearParticles: () => void;
  toggleMotor: (bodyId: string) => void;
  setMotorSpeed: (bodyId: string, speed: number) => void;
  setMotorTorque: (bodyId: string, torque: number) => void;
  removeMotor: (bodyId: string) => void;
  toggleTracer: (bodyId: string) => void;
  setTracerColor: (bodyId: string, color: string) => void;
  setTracerWidth: (bodyId: string, width: number) => void;
  clearTracerPath: (bodyId: string) => void;
  step: (dt: number) => void;
  clear: () => void;
  setGravity: (x: number, y: number) => void;

  setSnap: (enabled: boolean) => void;
  setSnapSize: (size: number) => void;
  setBgColor: (c: string) => void;
  setGridVisible: (v: boolean) => void;
  setGridColor: (c: string) => void;
  setGridStyle: (s: GridStyle) => void;
  setGridSize: (n: number) => void;
  duplicateBody: (bodyId: string) => void;

  // Timeline / rewind
  history: PhysicsFrame[];
  historyIdx: number; // -1 = live, ≥0 = scrubbing at this frame
  recordFrame: () => void;
  seekHistory: (idx: number) => void;
  scrubReturn: () => void;
  clearHistory: () => void;
}

export const useSandbox2DStore = create<Sandbox2DState>((set, get) => ({
  world: new World({ gravity: { x: 0, y: 9.81 } }),
  running: false,
  timeScale: 1,
  tool: 'select',
  selectedId: null,
  currentColor: '#60a5fa',
  rev: 0,
  particles: [],
  motors: new Map(),
  tracers: new Map(),

  history: [],
  historyIdx: -1,

  // Canvas settings defaults
  snapEnabled: false,
  snapSize: 0.5,
  bgColor: '#0c0c14',
  gridVisible: true,
  gridColor: 'rgba(255,255,255,0.05)',
  gridStyle: 'lines',
  gridSize: 1,

  setTool: (t) => set({ tool: t }),
  setRunning: (b) => set({ running: b }),
  toggleRunning: () => set((s) => ({ running: !s.running })),
  setTimeScale: (s) => set({ timeScale: s }),
  setSelected: (id) => set({ selectedId: id }),
  setColor: (c) => set({ currentColor: c }),

  addBody: (body) => {
    get().world.add(body);
    set({ rev: get().rev + 1 });
  },

  mutate: (fn) => {
    fn(get().world);
    set({ rev: get().rev + 1 });
  },

  addParticles: (ps) => {
    set((s) => ({ particles: [...s.particles, ...ps].slice(-700) }));
  },

  clearParticles: () => set({ particles: [] }),

  toggleMotor: (bodyId) => {
    const motors = new Map(get().motors);
    const existing = motors.get(bodyId);
    if (existing) {
      motors.set(bodyId, { ...existing, active: !existing.active });
    } else {
      motors.set(bodyId, { bodyId, speed: 3, torque: 20, active: true });
    }
    set({ motors, rev: get().rev + 1 });
  },

  setMotorSpeed: (bodyId, speed) => {
    const motors = new Map(get().motors);
    const m = motors.get(bodyId);
    if (m) {
      motors.set(bodyId, { ...m, speed });
      set({ motors });
    }
  },

  setMotorTorque: (bodyId, torque) => {
    const motors = new Map(get().motors);
    const m = motors.get(bodyId);
    if (m) {
      motors.set(bodyId, { ...m, torque });
      set({ motors });
    }
  },

  removeMotor: (bodyId) => {
    const motors = new Map(get().motors);
    motors.delete(bodyId);
    set({ motors, rev: get().rev + 1 });
  },

  toggleTracer: (bodyId) => {
    const tracers = new Map(get().tracers);
    if (tracers.has(bodyId)) tracers.delete(bodyId);
    else
      tracers.set(bodyId, {
        bodyId,
        points: [],
        color: DEFAULT_TRACER_COLOR,
        width: DEFAULT_TRACER_WIDTH,
        maxPoints: DEFAULT_TRACER_LEN,
      });
    set({ tracers, rev: get().rev + 1 });
  },

  setTracerColor: (bodyId, color) => {
    const tracers = new Map(get().tracers);
    const t = tracers.get(bodyId);
    if (!t) return;
    tracers.set(bodyId, { ...t, color });
    set({ tracers, rev: get().rev + 1 });
  },

  setTracerWidth: (bodyId, width) => {
    const tracers = new Map(get().tracers);
    const t = tracers.get(bodyId);
    if (!t) return;
    tracers.set(bodyId, { ...t, width: Math.max(0.005, width) });
    set({ tracers, rev: get().rev + 1 });
  },

  clearTracerPath: (bodyId) => {
    const tracers = new Map(get().tracers);
    const t = tracers.get(bodyId);
    if (!t) return;
    tracers.set(bodyId, { ...t, points: [] });
    set({ tracers, rev: get().rev + 1 });
  },

  step: (dt) => {
    const { world, running, timeScale, motors, particles, tracers } = get();
    if (!running) return;
    // Cap total scaled time, then split into substeps so fast speeds stay stable
    const scaledDt = Math.min(dt * timeScale, 0.12);
    const numSubsteps = Math.min(4, Math.max(1, Math.ceil(scaledDt / 0.025)));
    const subDt = scaledDt / numSubsteps;

    for (let sub = 0; sub < numSubsteps; sub++) {
      for (const [bodyId, motor] of motors) {
        if (!motor.active) continue;
        const body = world.bodies.find((b) => b.id === bodyId);
        if (!body || body.isStatic) continue;
        const err = motor.speed - body.angularVel;
        body.torqueAccum += Math.sign(err) * Math.min(Math.abs(err) * 5, motor.torque);
      }
      world.step(subDt);
    }

    if (particles.length > 0) {
      sphStep(particles, world.bodies, world.gravity, scaledDt);
    }

    // Update tracers
    let newTracers = tracers;
    if (tracers.size > 0) {
      newTracers = new Map(tracers);
      for (const [bodyId, t] of newTracers) {
        const body = world.bodies.find((b) => b.id === bodyId);
        if (!body) {
          newTracers.delete(bodyId);
          continue;
        }
        t.points.push({ x: body.pos.x, y: body.pos.y });
        if (t.points.length > t.maxPoints) t.points.shift();
      }
    }

    set({
      rev: get().rev + 1,
      tracers: newTracers,
      ...(particles.length > 0 ? { particles: [...particles] } : {}),
    });
  },

  clear: () => {
    get().world.clear();
    set({
      particles: [],
      motors: new Map(),
      tracers: new Map(),
      selectedId: null,
      history: [],
      historyIdx: -1,
      rev: get().rev + 1,
    });
  },

  setGravity: (x, y) => {
    get().world.gravity = { x, y };
    set({ rev: get().rev + 1 });
  },

  setSnap: (enabled) => set({ snapEnabled: enabled }),
  setSnapSize: (size) => set({ snapSize: size }),
  setBgColor: (c) => set({ bgColor: c }),
  setGridVisible: (v) => set({ gridVisible: v }),
  setGridColor: (c) => set({ gridColor: c }),
  setGridStyle: (s) => set({ gridStyle: s }),
  setGridSize: (n) => set({ gridSize: n }),

  recordFrame: () => {
    const { world, particles, history, historyIdx } = get();
    if (historyIdx >= 0) return;
    const frame: PhysicsFrame = {
      bodies: world.bodies.map((b) => ({
        id: b.id,
        px: b.pos.x, py: b.pos.y,
        vx: b.vel.x, vy: b.vel.y,
        angle: b.angle, av: b.angularVel,
      })),
      particles: particles.slice(0, 400).map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
    };
    const next = history.length >= MAX_HISTORY
      ? [...history.slice(1), frame]
      : [...history, frame];
    set({ history: next });
  },

  seekHistory: (rawIdx) => {
    const { history, world, particles } = get();
    const idx = Math.max(0, Math.min(history.length - 1, rawIdx));
    const frame = history[idx];
    if (!frame) return;
    for (const bf of frame.bodies) {
      const b = world.bodies.find((b) => b.id === bf.id);
      if (!b) continue;
      b.pos.x = bf.px; b.pos.y = bf.py;
      b.vel.x = bf.vx; b.vel.y = bf.vy;
      b.angle = bf.angle; b.angularVel = bf.av;
      b.sleeping = false;
    }
    const pLen = Math.min(frame.particles.length, particles.length);
    for (let i = 0; i < pLen; i++) {
      const pf = frame.particles[i], p = particles[i];
      p.x = pf.x; p.y = pf.y; p.vx = pf.vx; p.vy = pf.vy;
    }
    set({ historyIdx: idx, running: false, rev: get().rev + 1 });
  },

  scrubReturn: () => set({ historyIdx: -1 }),
  clearHistory: () => set({ history: [], historyIdx: -1 }),

  duplicateBody: (bodyId) => {
    const world = get().world;
    const src = world.bodies.find((b) => b.id === bodyId);
    if (!src) return;
    let shape;
    if (src.shape.kind === 'circle') {
      shape = makeCircle(src.shape.radius);
    } else {
      shape = makePolygonFromVertices(src.shape.vertices.map((v) => ({ x: v.x, y: v.y })));
    }
    const clone = makeBody(shape, {
      pos: { x: src.pos.x + 0.5, y: src.pos.y - 0.3 },
      density: 1,
      restitution: src.restitution,
      friction: src.friction,
      color: src.color,
      isStatic: src.isStatic,
    });
    // Preserve exact mass/inertia from source
    clone.mass = src.mass;
    clone.invMass = src.invMass;
    clone.inertia = src.inertia;
    clone.invInertia = src.invInertia;
    clone.lockRotation = src.lockRotation;
    clone.angle = src.angle;
    world.add(clone);
    set({ selectedId: clone.id, rev: get().rev + 1 });
  },
}));
