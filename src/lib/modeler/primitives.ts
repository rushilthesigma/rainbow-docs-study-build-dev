import * as THREE from 'three';

export type PrimitiveType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'plane'
  | 'capsule'
  | 'torusKnot'
  | 'tetrahedron'
  | 'octahedron'
  | 'icosahedron'
  | 'dodecahedron';

export interface PrimitiveParams {
  size?: number;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  tube?: number;
  segments?: number;
  rings?: number;
  /** torusKnot params */
  p?: number;
  q?: number;
  /** capsule length */
  length?: number;
}

export function buildPrimitive(type: PrimitiveType, params: PrimitiveParams = {}): THREE.BufferGeometry {
  switch (type) {
    case 'box': {
      const w = params.width ?? params.size ?? 1;
      const h = params.height ?? params.size ?? 1;
      const d = params.depth ?? params.size ?? 1;
      return new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    }
    case 'sphere': {
      const r = params.radius ?? params.size ?? 0.5;
      const s = params.segments ?? 24;
      const r2 = params.rings ?? Math.max(8, Math.floor(s / 2));
      return new THREE.SphereGeometry(r, s, r2);
    }
    case 'cylinder': {
      const rt = params.radiusTop ?? params.radius ?? 0.5;
      const rb = params.radiusBottom ?? params.radius ?? 0.5;
      const h = params.height ?? params.size ?? 1;
      const s = params.segments ?? 24;
      return new THREE.CylinderGeometry(rt, rb, h, s);
    }
    case 'cone': {
      const r = params.radius ?? params.size ?? 0.5;
      const h = params.height ?? params.size ?? 1;
      const s = params.segments ?? 24;
      return new THREE.ConeGeometry(r, h, s);
    }
    case 'torus': {
      const r = params.radius ?? 0.5;
      const tube = params.tube ?? 0.18;
      const s = params.segments ?? 16;
      const r2 = params.rings ?? 32;
      return new THREE.TorusGeometry(r, tube, s, r2);
    }
    case 'plane': {
      const w = params.width ?? params.size ?? 1;
      const h = params.height ?? params.size ?? 1;
      return new THREE.PlaneGeometry(w, h);
    }
    case 'capsule': {
      const r = params.radius ?? 0.3;
      const len = params.length ?? params.height ?? 1;
      const segs = params.segments ?? 12;
      return new THREE.CapsuleGeometry(r, len, Math.max(2, Math.floor(segs / 2)), segs);
    }
    case 'torusKnot': {
      const r = params.radius ?? 0.5;
      const tube = params.tube ?? 0.16;
      const tubular = params.segments ?? 96;
      const radial = params.rings ?? 12;
      const p = params.p ?? 2;
      const q = params.q ?? 3;
      return new THREE.TorusKnotGeometry(r, tube, tubular, radial, p, q);
    }
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(params.radius ?? params.size ?? 0.7, 0);
    case 'octahedron':
      return new THREE.OctahedronGeometry(params.radius ?? params.size ?? 0.7, 0);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(params.radius ?? params.size ?? 0.6, 0);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(params.radius ?? params.size ?? 0.6, 0);
  }
}

/**
 * Convert a 2D polygon (xy points) into an extruded 3D geometry. Used by the
 * Modeler3D sketch tool - let users draw a closed loop on a plane and pull it
 * into a solid.
 */
export function extrudePolygon(
  points: { x: number; y: number }[],
  depth = 0.4,
  bevel = 0,
): THREE.BufferGeometry {
  if (points.length < 3) return new THREE.BufferGeometry();
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.lineTo(points[0].x, points[0].y);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geom.center();
  return geom;
}
