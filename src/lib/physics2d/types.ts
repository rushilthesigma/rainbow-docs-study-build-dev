import { type AABB, type Vec2, rotate, v } from './math';

export type ShapeKind = 'circle' | 'polygon';

export interface CircleShape {
  kind: 'circle';
  radius: number;
}

export interface PolygonShape {
  kind: 'polygon';
  /** Convex vertices in local space, CCW order */
  vertices: Vec2[];
  /** Outward unit normals for each edge (computed from vertices) */
  normals: Vec2[];
}

export type Shape = CircleShape | PolygonShape;

export interface Body {
  id: string;
  shape: Shape;
  pos: Vec2;
  vel: Vec2;
  angle: number;
  angularVel: number;
  forceAccum: Vec2;
  torqueAccum: number;
  mass: number;
  invMass: number;
  inertia: number;
  invInertia: number;
  restitution: number;
  friction: number;
  isStatic: boolean;
  /** lock orientation (e.g. wheels off / characters upright) */
  lockRotation: boolean;
  /** sleeping */
  sleeping: boolean;
  sleepTimer: number;
  /** cosmetic */
  color: string;
  label?: string;
}

export function makeCircle(radius: number): CircleShape {
  return { kind: 'circle', radius };
}

export function makeBox(halfW: number, halfH: number): PolygonShape {
  const vertices: Vec2[] = [
    v(-halfW, -halfH),
    v(halfW, -halfH),
    v(halfW, halfH),
    v(-halfW, halfH),
  ];
  return makePolygonFromVertices(vertices);
}

/** N-sided regular polygon inscribed in `radius`. N must be 3..16. */
export function makeRegularPolygon(n: number, radius: number, rotation = 0): PolygonShape {
  n = Math.max(3, Math.min(16, Math.round(n)));
  const verts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2;
    verts.push(v(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return makePolygonFromVertices(verts);
}

export function makePolygonFromVertices(input: Vec2[]): PolygonShape {
  // Ensure CCW winding so the outward-normal computation is correct no matter
  // how the caller produced the points (imported / silhouette / y-flipped).
  let area2 = 0;
  for (let i = 0; i < input.length; i++) {
    const a = input[i];
    const b = input[(i + 1) % input.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  const vertices = area2 < 0 ? input.slice().reverse() : input.slice();

  const normals: Vec2[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    // Outward normal for CCW polygon: rotate edge by -90°
    const n = { x: edge.y, y: -edge.x };
    const L = Math.hypot(n.x, n.y) || 1;
    normals.push({ x: n.x / L, y: n.y / L });
  }
  return { kind: 'polygon', vertices, normals };
}

let bodySeq = 1;
export function nextBodyId(prefix = 'b'): string {
  return `${prefix}-${(bodySeq++).toString(36)}`;
}

export interface BodyParams {
  pos?: Vec2;
  vel?: Vec2;
  angle?: number;
  angularVel?: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  isStatic?: boolean;
  lockRotation?: boolean;
  color?: string;
  label?: string;
  /** Override density if mass omitted */
  density?: number;
}

const DEFAULT_COLORS = [
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#facc15',
  '#34d399',
  '#22d3ee',
];

let colorIdx = 0;

export function makeBody(shape: Shape, params: BodyParams = {}): Body {
  const isStatic = params.isStatic ?? false;
  const density = params.density ?? 1;
  let mass = params.mass ?? (isStatic ? 0 : computeMass(shape, density));
  if (isStatic) mass = 0;
  const inertia = isStatic ? 0 : computeInertia(shape, mass);
  const color = params.color ?? DEFAULT_COLORS[colorIdx++ % DEFAULT_COLORS.length];
  return {
    id: nextBodyId(shape.kind === 'circle' ? 'c' : 'p'),
    shape,
    pos: params.pos ? { ...params.pos } : v(0, 0),
    vel: params.vel ? { ...params.vel } : v(0, 0),
    angle: params.angle ?? 0,
    angularVel: params.angularVel ?? 0,
    forceAccum: v(0, 0),
    torqueAccum: 0,
    mass,
    invMass: mass > 0 ? 1 / mass : 0,
    inertia,
    invInertia: inertia > 0 ? 1 / inertia : 0,
    restitution: params.restitution ?? 0.2,
    friction: params.friction ?? 0.4,
    isStatic,
    lockRotation: params.lockRotation ?? false,
    sleeping: false,
    sleepTimer: 0,
    color,
    label: params.label,
  };
}

function computeMass(shape: Shape, density: number): number {
  if (shape.kind === 'circle') return density * Math.PI * shape.radius * shape.radius;
  return density * polygonArea(shape.vertices);
}

function polygonArea(verts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(a / 2);
}

function computeInertia(shape: Shape, mass: number): number {
  if (shape.kind === 'circle') return 0.5 * mass * shape.radius * shape.radius;
  // Inertia of a convex polygon about its centroid, assuming uniform density.
  // I = (m / (6 * sumA)) * sum(|cross|*(p_i.p_i + p_i.p_{i+1} + p_{i+1}.p_{i+1}))
  const verts = shape.vertices;
  let num = 0;
  let den = 0;
  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    const cross = Math.abs(p1.x * p2.y - p2.x * p1.y);
    num += cross * (p1.x * p1.x + p1.x * p2.x + p2.x * p2.x + p1.y * p1.y + p1.y * p2.y + p2.y * p2.y);
    den += cross;
  }
  if (den === 0) return mass;
  return (mass * num) / (6 * den);
}

export function worldVertices(body: Body): Vec2[] {
  if (body.shape.kind !== 'polygon') return [];
  return body.shape.vertices.map((p) => {
    const r = rotate(p, body.angle);
    return { x: r.x + body.pos.x, y: r.y + body.pos.y };
  });
}

export function computeAABB(body: Body): AABB {
  if (body.shape.kind === 'circle') {
    return {
      minX: body.pos.x - body.shape.radius,
      minY: body.pos.y - body.shape.radius,
      maxX: body.pos.x + body.shape.radius,
      maxY: body.pos.y + body.shape.radius,
    };
  }
  const verts = worldVertices(body);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const v_ of verts) {
    if (v_.x < minX) minX = v_.x;
    if (v_.x > maxX) maxX = v_.x;
    if (v_.y < minY) minY = v_.y;
    if (v_.y > maxY) maxY = v_.y;
  }
  return { minX, minY, maxX, maxY };
}
