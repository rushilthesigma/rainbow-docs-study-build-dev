/**
 * Turn an arbitrary 3D mesh into something AeroSim can test:
 *   - a 2D silhouette polygon (used as the airfoil cross-section + CFD obstacle)
 *   - normalized to unit chord, centred on the quarter-chord, like the NACA gen
 *
 * The silhouette is the convex hull of every vertex projected onto the X-Y
 * plane. Convex hull is robust for wing/airfoil-like extrusions and never
 * produces self-intersecting outlines, which keeps the potential-flow and
 * stable-fluids solvers stable.
 *
 * Also includes a minimal OBJ parser so users can drag in a .obj file.
 */
import * as THREE from 'three';
import type { Vec2 } from '../physics2d/math';

/** Andrew's monotone-chain convex hull. Returns CCW points. */
function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Project a geometry's vertices onto X-Y, hull them, then normalise so the
 * chord (x-extent) is 1 and the shape is positioned like generateAirfoil()
 * output (leading edge near x=0, trailing edge near x=1).
 */
export function extractSilhouette(geometry: THREE.BufferGeometry): Vec2[] {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return [];
  const raw: Vec2[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    raw.push({ x: posAttr.getX(i), y: posAttr.getY(i) });
  }
  if (raw.length < 3) return [];
  const hull = convexHull(raw);
  if (hull.length < 3) return [];

  // Normalize: shift so min x = 0, scale so x-extent = 1
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of hull) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = Math.max(1e-6, maxX - minX);
  const cy = (minY + maxY) / 2;
  return hull.map((p) => ({
    x: (p.x - minX) / span,
    y: (p.y - cy) / span,
  }));
}

/** Minimal Wavefront OBJ parser → BufferGeometry (positions + triangulated faces). */
export function parseOBJ(text: string): THREE.BufferGeometry {
  const verts: number[][] = [];
  const positions: number[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('v ')) {
      const parts = t.slice(2).trim().split(/\s+/).map(Number);
      verts.push([parts[0] || 0, parts[1] || 0, parts[2] || 0]);
    } else if (t.startsWith('f ')) {
      const idx = t
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((tok) => {
          const v = parseInt(tok.split('/')[0], 10);
          return v < 0 ? verts.length + v : v - 1;
        });
      // Fan-triangulate the polygon
      for (let i = 1; i < idx.length - 1; i++) {
        for (const vi of [idx[0], idx[i], idx[i + 1]]) {
          const v = verts[vi];
          if (v) positions.push(v[0], v[1], v[2]);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** Parse a binary or ASCII STL into a BufferGeometry (positions only). */
export function parseSTL(buf: ArrayBuffer): THREE.BufferGeometry {
  const dv = new DataView(buf);
  // Heuristic: ASCII STL starts with "solid" AND has no plausible binary tri count.
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(80, buf.byteLength)));
  const isAscii =
    head.trimStart().toLowerCase().startsWith('solid') &&
    buf.byteLength > 84 &&
    dv.getUint32(80, true) * 50 + 84 !== buf.byteLength;

  const positions: number[] = [];
  if (isAscii) {
    const text = new TextDecoder().decode(new Uint8Array(buf));
    const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
  } else {
    const tris = dv.getUint32(80, true);
    let off = 84;
    for (let i = 0; i < tris && off + 50 <= buf.byteLength; i++) {
      off += 12; // skip normal
      for (let v = 0; v < 3; v++) {
        positions.push(
          dv.getFloat32(off, true),
          dv.getFloat32(off + 4, true),
          dv.getFloat32(off + 8, true),
        );
        off += 12;
      }
      off += 2; // attribute byte count
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/** Build a closed THREE.Shape from a silhouette (for the 2D viewport mesh). */
export function silhouetteToShape(pts: Vec2[]): THREE.Shape {
  const s = new THREE.Shape();
  if (!pts.length) return s;
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y);
  s.lineTo(pts[0].x, pts[0].y);
  return s;
}
