import { type Vec2, vsub, vdot, vlen, vscale, vadd, rotate } from './math';
import { type Body, type PolygonShape, worldVertices } from './types';

export interface Contact {
  /** World-space contact point */
  point: Vec2;
  /** Penetration depth (positive when overlapping) */
  depth: number;
}

export interface Manifold {
  bodyA: Body;
  bodyB: Body;
  /** Unit normal pointing from A to B */
  normal: Vec2;
  contacts: Contact[];
  /** Combined restitution / friction for this contact pair */
  restitution: number;
  friction: number;
}

export function collide(a: Body, b: Body): Manifold | null {
  if (a.shape.kind === 'circle' && b.shape.kind === 'circle') return circleCircle(a, b);
  if (a.shape.kind === 'circle' && b.shape.kind === 'polygon') return circlePolygon(a, b, false);
  if (a.shape.kind === 'polygon' && b.shape.kind === 'circle') return circlePolygon(b, a, true);
  if (a.shape.kind === 'polygon' && b.shape.kind === 'polygon') return polygonPolygon(a, b);
  return null;
}

function circleCircle(a: Body, b: Body): Manifold | null {
  if (a.shape.kind !== 'circle' || b.shape.kind !== 'circle') return null;
  const d = vsub(b.pos, a.pos);
  const r = a.shape.radius + b.shape.radius;
  const distSq = d.x * d.x + d.y * d.y;
  if (distSq >= r * r) return null;
  const dist = Math.sqrt(distSq);
  const normal = dist > 0 ? { x: d.x / dist, y: d.y / dist } : { x: 1, y: 0 };
  const depth = r - dist;
  const point = vadd(a.pos, vscale(normal, a.shape.radius - depth / 2));
  return {
    bodyA: a,
    bodyB: b,
    normal,
    contacts: [{ point, depth }],
    restitution: Math.min(a.restitution, b.restitution),
    friction: Math.sqrt(a.friction * b.friction),
  };
}

/** circle = a, polygon = b. If `flipped`, swap output so manifold A/B order matches caller. */
function circlePolygon(circle: Body, poly: Body, flipped: boolean): Manifold | null {
  if (circle.shape.kind !== 'circle' || poly.shape.kind !== 'polygon') return null;
  const radius = circle.shape.radius;
  const verts = worldVertices(poly);
  const normals = poly.shape.normals.map((n) => rotate(n, poly.angle));

  // Find edge with greatest separation between circle center and that edge.
  let maxSep = -Infinity;
  let edgeIdx = 0;
  for (let i = 0; i < verts.length; i++) {
    const n = normals[i];
    const sep = vdot(n, vsub(circle.pos, verts[i]));
    if (sep > radius) return null;
    if (sep > maxSep) {
      maxSep = sep;
      edgeIdx = i;
    }
  }

  if (maxSep < 0) {
    // Circle center inside polygon: contact on closest face
    const n = normals[edgeIdx];
    const depth = radius - maxSep;
    const normalAB = flipped ? { x: -n.x, y: -n.y } : n;
    const point = vsub(circle.pos, vscale(n, radius));
    return manifoldFromPair(circle, poly, flipped, normalAB, depth, point);
  }

  // Otherwise project circle onto chosen edge and clamp
  const a = verts[edgeIdx];
  const b = verts[(edgeIdx + 1) % verts.length];
  const ab = vsub(b, a);
  const t = vdot(vsub(circle.pos, a), ab) / vdot(ab, ab);
  const tClamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const closest = { x: a.x + ab.x * tClamped, y: a.y + ab.y * tClamped };
  const d = vsub(circle.pos, closest);
  const distSq = d.x * d.x + d.y * d.y;
  if (distSq > radius * radius) return null;
  const dist = Math.sqrt(distSq);
  const n = dist > 0 ? { x: d.x / dist, y: d.y / dist } : normals[edgeIdx];
  // normal points from polygon to circle; A→B should be circle→polygon if not flipped
  const normalAB = flipped ? n : { x: -n.x, y: -n.y };
  const depth = radius - dist;
  return manifoldFromPair(circle, poly, flipped, normalAB, depth, closest);
}

function manifoldFromPair(
  circle: Body,
  poly: Body,
  flipped: boolean,
  normalAB: Vec2,
  depth: number,
  point: Vec2,
): Manifold {
  const bodyA = flipped ? poly : circle;
  const bodyB = flipped ? circle : poly;
  return {
    bodyA,
    bodyB,
    normal: normalAB,
    contacts: [{ point, depth }],
    restitution: Math.min(bodyA.restitution, bodyB.restitution),
    friction: Math.sqrt(bodyA.friction * bodyB.friction),
  };
}

/**
 * Polygon-polygon SAT with edge clipping for contact points.
 * Returns a manifold with up to 2 contact points.
 */
function polygonPolygon(a: Body, b: Body): Manifold | null {
  if (a.shape.kind !== 'polygon' || b.shape.kind !== 'polygon') return null;
  const A = projectInfo(a);
  const B = projectInfo(b);

  // Find face with least penetration on A and on B
  const sepA = findAxisLeastPenetration(A, B);
  if (sepA.distance >= 0) return null;
  const sepB = findAxisLeastPenetration(B, A);
  if (sepB.distance >= 0) return null;

  // Reference vs incident: take the one with greater separation (i.e. less negative)
  let refIsA = sepA.distance >= sepB.distance;
  let ref = refIsA ? A : B;
  let inc = refIsA ? B : A;
  const refIdx = refIsA ? sepA.faceIndex : sepB.faceIndex;

  // Find incident face: face on `inc` whose normal is most anti-parallel to ref face normal
  const refNormal = ref.normals[refIdx];
  let incIdx = 0;
  let minDot = Infinity;
  for (let i = 0; i < inc.normals.length; i++) {
    const d = vdot(refNormal, inc.normals[i]);
    if (d < minDot) {
      minDot = d;
      incIdx = i;
    }
  }
  // Incident edge endpoints in world space
  const incEnds: Vec2[] = [inc.verts[incIdx], inc.verts[(incIdx + 1) % inc.verts.length]];

  // Clip against side planes of the reference face
  const refV1 = ref.verts[refIdx];
  const refV2 = ref.verts[(refIdx + 1) % ref.verts.length];
  const sidePlaneNormal = { x: refV2.x - refV1.x, y: refV2.y - refV1.y };
  const L = Math.hypot(sidePlaneNormal.x, sidePlaneNormal.y) || 1;
  sidePlaneNormal.x /= L;
  sidePlaneNormal.y /= L;
  const negSide = -vdot(sidePlaneNormal, refV1);
  const posSide = vdot(sidePlaneNormal, refV2);

  // Clip incident edge by side planes
  let clipped = clip(incEnds, { x: -sidePlaneNormal.x, y: -sidePlaneNormal.y }, negSide);
  if (clipped.length < 2) return null;
  clipped = clip(clipped, sidePlaneNormal, posSide);
  if (clipped.length < 2) return null;

  // Keep only points behind the reference face
  const refFaceOffset = vdot(refNormal, refV1);
  const contacts: Contact[] = [];
  for (const p of clipped) {
    const sep = vdot(refNormal, p) - refFaceOffset;
    if (sep <= 0) contacts.push({ point: p, depth: -sep });
  }

  if (!contacts.length) return null;
  // Normal should point from A to B (in original argument order).
  const normalAB = refIsA
    ? refNormal
    : { x: -refNormal.x, y: -refNormal.y };

  return {
    bodyA: a,
    bodyB: b,
    normal: normalAB,
    contacts,
    restitution: Math.min(a.restitution, b.restitution),
    friction: Math.sqrt(a.friction * b.friction),
  };
}

interface ProjectInfo {
  body: Body;
  verts: Vec2[];
  normals: Vec2[];
}

function projectInfo(body: Body): ProjectInfo {
  const verts = worldVertices(body);
  const normals = (body.shape as PolygonShape).normals.map((n) => rotate(n, body.angle));
  return { body, verts, normals };
}

function findAxisLeastPenetration(
  ref: ProjectInfo,
  inc: ProjectInfo,
): { distance: number; faceIndex: number } {
  let bestDistance = -Infinity;
  let bestIndex = 0;
  for (let i = 0; i < ref.verts.length; i++) {
    const n = ref.normals[i];
    // support point of incident in direction -n
    let supportVal = Infinity;
    let supportPt = inc.verts[0];
    for (const p of inc.verts) {
      const d = vdot(n, p);
      if (d < supportVal) {
        supportVal = d;
        supportPt = p;
      }
    }
    const dist = vdot(n, vsub(supportPt, ref.verts[i]));
    if (dist > bestDistance) {
      bestDistance = dist;
      bestIndex = i;
    }
  }
  return { distance: bestDistance, faceIndex: bestIndex };
}

/** Clip a segment of two points by a plane: keep portion where n·p ≤ d */
function clip(pts: Vec2[], n: Vec2, d: number): Vec2[] {
  if (pts.length !== 2) return [];
  const out: Vec2[] = [];
  const d1 = vdot(n, pts[0]) - d;
  const d2 = vdot(n, pts[1]) - d;
  if (d1 <= 0) out.push(pts[0]);
  if (d2 <= 0) out.push(pts[1]);
  if (d1 * d2 < 0) {
    const t = d1 / (d1 - d2);
    out.push({
      x: pts[0].x + t * (pts[1].x - pts[0].x),
      y: pts[0].y + t * (pts[1].y - pts[0].y),
    });
  }
  return out;
}

// re-export so callers don't have to import math.ts
export { vlen };
