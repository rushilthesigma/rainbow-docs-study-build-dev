/**
 * Hand-written OBJ and STL writers. We could use three.js's bundled exporters
 * but rolling our own keeps the bundle smaller and avoids version pinning.
 *
 * GLTF export uses three.js's GLTFExporter (drei re-exports it) since the
 * format is too involved to write from scratch.
 */
import * as THREE from 'three';

export function toOBJ(meshes: THREE.Mesh[]): string {
  let out = '# EngOS Modeler3D OBJ export\n';
  let voff = 1;
  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi];
    out += `o object_${mi}\n`;
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    if (!geom.attributes.normal) geom.computeVertexNormals();
    const pos = geom.attributes.position.array as Float32Array;
    const nrm = geom.attributes.normal.array as Float32Array;
    const idx = geom.index ? (geom.index.array as ArrayLike<number>) : null;
    const N = pos.length / 3;
    for (let i = 0; i < N; i++) {
      out += `v ${pos[i * 3].toFixed(6)} ${pos[i * 3 + 1].toFixed(6)} ${pos[i * 3 + 2].toFixed(6)}\n`;
    }
    for (let i = 0; i < N; i++) {
      out += `vn ${nrm[i * 3].toFixed(6)} ${nrm[i * 3 + 1].toFixed(6)} ${nrm[i * 3 + 2].toFixed(6)}\n`;
    }
    if (idx) {
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] + voff,
          b = idx[i + 1] + voff,
          c = idx[i + 2] + voff;
        out += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      }
    } else {
      for (let i = 0; i < N; i += 3) {
        const a = i + voff,
          b = i + 1 + voff,
          c = i + 2 + voff;
        out += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      }
    }
    voff += N;
  }
  return out;
}

export function toASCIISTL(meshes: THREE.Mesh[]): string {
  let out = 'solid engos\n';
  for (const mesh of meshes) {
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    const pos = geom.attributes.position.array as Float32Array;
    const idx = geom.index ? (geom.index.array as ArrayLike<number>) : null;
    const writeTri = (a: number, b: number, c: number) => {
      const ax = pos[a * 3],
        ay = pos[a * 3 + 1],
        az = pos[a * 3 + 2];
      const bx = pos[b * 3],
        by = pos[b * 3 + 1],
        bz = pos[b * 3 + 2];
      const cx = pos[c * 3],
        cy = pos[c * 3 + 1],
        cz = pos[c * 3 + 2];
      const ux = bx - ax,
        uy = by - ay,
        uz = bz - az;
      const vx = cx - ax,
        vy = cy - ay,
        vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1;
      out += `  facet normal ${(nx / L).toFixed(6)} ${(ny / L).toFixed(6)} ${(nz / L).toFixed(6)}\n`;
      out += '    outer loop\n';
      out += `      vertex ${ax.toFixed(6)} ${ay.toFixed(6)} ${az.toFixed(6)}\n`;
      out += `      vertex ${bx.toFixed(6)} ${by.toFixed(6)} ${bz.toFixed(6)}\n`;
      out += `      vertex ${cx.toFixed(6)} ${cy.toFixed(6)} ${cz.toFixed(6)}\n`;
      out += '    endloop\n  endfacet\n';
    };
    if (idx) {
      for (let i = 0; i < idx.length; i += 3) writeTri(idx[i], idx[i + 1], idx[i + 2]);
    } else {
      const N = pos.length / 3;
      for (let i = 0; i < N; i += 3) writeTri(i, i + 1, i + 2);
    }
  }
  out += 'endsolid engos\n';
  return out;
}

export function toBinarySTL(meshes: THREE.Mesh[]): ArrayBuffer {
  let triCount = 0;
  for (const mesh of meshes) {
    const geom = mesh.geometry;
    if (geom.index) triCount += geom.index.count / 3;
    else triCount += geom.attributes.position.count / 3;
  }
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  view.setUint32(80, triCount, true);
  let off = 84;
  for (const mesh of meshes) {
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    const pos = geom.attributes.position.array as Float32Array;
    const idx = geom.index ? (geom.index.array as ArrayLike<number>) : null;
    const writeTri = (a: number, b: number, c: number) => {
      const ax = pos[a * 3],
        ay = pos[a * 3 + 1],
        az = pos[a * 3 + 2];
      const bx = pos[b * 3],
        by = pos[b * 3 + 1],
        bz = pos[b * 3 + 2];
      const cx = pos[c * 3],
        cy = pos[c * 3 + 1],
        cz = pos[c * 3 + 2];
      const ux = bx - ax,
        uy = by - ay,
        uz = bz - az;
      const vx = cx - ax,
        vy = cy - ay,
        vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1;
      view.setFloat32(off, nx / L, true);
      view.setFloat32(off + 4, ny / L, true);
      view.setFloat32(off + 8, nz / L, true);
      view.setFloat32(off + 12, ax, true);
      view.setFloat32(off + 16, ay, true);
      view.setFloat32(off + 20, az, true);
      view.setFloat32(off + 24, bx, true);
      view.setFloat32(off + 28, by, true);
      view.setFloat32(off + 32, bz, true);
      view.setFloat32(off + 36, cx, true);
      view.setFloat32(off + 40, cy, true);
      view.setFloat32(off + 44, cz, true);
      view.setUint16(off + 48, 0, true);
      off += 50;
    };
    if (idx) {
      for (let i = 0; i < idx.length; i += 3) writeTri(idx[i], idx[i + 1], idx[i + 2]);
    } else {
      const N = pos.length / 3;
      for (let i = 0; i < N; i += 3) writeTri(i, i + 1, i + 2);
    }
  }
  return buf;
}

export function downloadBlob(filename: string, content: string | ArrayBuffer, mime: string) {
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: mime })
      : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  // fire-and-forget toast notification - async-imported to avoid a circular dep
  import('@/store/toastStore').then(({ toast }) => toast.success('Exported', filename));
}
