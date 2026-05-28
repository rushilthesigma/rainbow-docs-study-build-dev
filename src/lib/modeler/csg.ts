/**
 * Boolean operations on Three.js meshes using three-bvh-csg. The library does
 * the heavy lifting; we just construct Brushes from world-space geometry and
 * apply them via an Evaluator.
 */
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';

export type BooleanOp = 'union' | 'subtract' | 'intersect';

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];

function brushFrom(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): Brush {
  // The CSG evaluator works in each brush's local space, so we bake the world
  // matrix into a cloned geometry before constructing the brush.
  const clone = geometry.clone();
  clone.applyMatrix4(matrix);
  // The CSG library requires explicit normals.
  if (!clone.attributes.normal) clone.computeVertexNormals();
  const b = new Brush(clone);
  b.updateMatrixWorld(true);
  return b;
}

export function csg(
  a: THREE.BufferGeometry,
  aMatrix: THREE.Matrix4,
  b: THREE.BufferGeometry,
  bMatrix: THREE.Matrix4,
  op: BooleanOp,
): THREE.BufferGeometry {
  const ba = brushFrom(a, aMatrix);
  const bb = brushFrom(b, bMatrix);
  const code = op === 'union' ? ADDITION : op === 'subtract' ? SUBTRACTION : INTERSECTION;
  const result = evaluator.evaluate(ba, bb, code);
  result.updateMatrixWorld(true);
  // Return geometry positioned in world space; caller can rebake into a chosen pivot.
  const geom = result.geometry.clone();
  return geom;
}
