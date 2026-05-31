/**
 * Non-destructive modifiers applied at render time. Each modifier produces a
 * geometry from the input geometry + the object's local transform.
 *
 *   Mirror   - duplicates geometry mirrored across an axis plane in local space
 *   Array    - duplicates geometry N times with a per-copy offset
 *   Solidify - extrudes faces outward along their normals to add wall thickness
 *   SubSurf  - Loop-style subdivision via repeated tessellation + normal smoothing
 *
 * Modifiers stack: each operates on the previous modifier's output.
 */
import * as THREE from 'three';

export type ModifierKind = 'mirror' | 'array' | 'solidify' | 'subsurf';

export interface MirrorParams {
  kind: 'mirror';
  axis: 'x' | 'y' | 'z';
}

export interface ArrayParams {
  kind: 'array';
  count: number;
  offset: [number, number, number];
}

export interface SolidifyParams {
  kind: 'solidify';
  thickness: number;
}

export interface SubsurfParams {
  kind: 'subsurf';
  iterations: number;
}

export type Modifier = MirrorParams | ArrayParams | SolidifyParams | SubsurfParams;

export function applyModifier(geom: THREE.BufferGeometry, mod: Modifier): THREE.BufferGeometry {
  switch (mod.kind) {
    case 'mirror':
      return mirror(geom, mod.axis);
    case 'array':
      return array(geom, mod.count, mod.offset);
    case 'solidify':
      return solidify(geom, mod.thickness);
    case 'subsurf':
      return subdivide(geom, Math.max(1, Math.min(3, mod.iterations)));
  }
}

export function applyStack(geom: THREE.BufferGeometry, stack: Modifier[]): THREE.BufferGeometry {
  let out = geom;
  for (const m of stack) out = applyModifier(out, m);
  return out;
}

function mirror(geom: THREE.BufferGeometry, axis: 'x' | 'y' | 'z'): THREE.BufferGeometry {
  const mirrored = geom.clone();
  const m = new THREE.Matrix4().makeScale(
    axis === 'x' ? -1 : 1,
    axis === 'y' ? -1 : 1,
    axis === 'z' ? -1 : 1,
  );
  mirrored.applyMatrix4(m);
  // Flip winding so normals stay outward
  if (mirrored.index) {
    const arr = mirrored.index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i];
      arr[i] = arr[i + 2];
      arr[i + 2] = t;
    }
    mirrored.index.needsUpdate = true;
  }
  mirrored.computeVertexNormals();
  return mergeGeometries([geom.clone(), mirrored]);
}

function array(
  geom: THREE.BufferGeometry,
  count: number,
  offset: [number, number, number],
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < Math.max(1, Math.min(64, count)); i++) {
    const g = geom.clone();
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(offset[0] * i, offset[1] * i, offset[2] * i));
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function solidify(geom: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  // Approximate solidify: clone the geometry, push along inverted normals.
  const inner = geom.clone();
  inner.computeVertexNormals();
  const pos = inner.attributes.position.array as Float32Array;
  const normals = inner.attributes.normal.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= normals[i] * thickness;
    pos[i + 1] -= normals[i + 1] * thickness;
    pos[i + 2] -= normals[i + 2] * thickness;
  }
  inner.attributes.position.needsUpdate = true;
  // Flip winding on inner shell
  if (inner.index) {
    const arr = inner.index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i];
      arr[i] = arr[i + 2];
      arr[i + 2] = t;
    }
    inner.index.needsUpdate = true;
  }
  inner.computeVertexNormals();
  return mergeGeometries([geom.clone(), inner]);
}

function subdivide(geom: THREE.BufferGeometry, iters: number): THREE.BufferGeometry {
  let g = geom.toNonIndexed();
  for (let k = 0; k < iters; k++) {
    const pos = g.attributes.position.array as Float32Array;
    const newPos: number[] = [];
    // For each triangle, output 4 sub-triangles via midpoint subdivision
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i],
        ay = pos[i + 1],
        az = pos[i + 2];
      const bx = pos[i + 3],
        by = pos[i + 4],
        bz = pos[i + 5];
      const cx = pos[i + 6],
        cy = pos[i + 7],
        cz = pos[i + 8];
      const abx = (ax + bx) * 0.5,
        aby = (ay + by) * 0.5,
        abz = (az + bz) * 0.5;
      const bcx = (bx + cx) * 0.5,
        bcy = (by + cy) * 0.5,
        bcz = (bz + cz) * 0.5;
      const cax = (cx + ax) * 0.5,
        cay = (cy + ay) * 0.5,
        caz = (cz + az) * 0.5;
      newPos.push(
        ax, ay, az, abx, aby, abz, cax, cay, caz,
        abx, aby, abz, bx, by, bz, bcx, bcy, bcz,
        cax, cay, caz, bcx, bcy, bcz, cx, cy, cz,
        abx, aby, abz, bcx, bcy, bcz, cax, cay, caz,
      );
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
    g = ng;
  }
  g.computeVertexNormals();
  return g;
}

/** Minimal geometry merge that concatenates position+normal+index. */
function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const g of geoms) {
    const pg = g.toNonIndexed();
    const pos = pg.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
    const tris = pos.length / 3;
    for (let i = 0; i < tris; i++) indices.push(offset + i);
    offset += tris;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setIndex(indices);
  out.computeVertexNormals();
  return out;
}
