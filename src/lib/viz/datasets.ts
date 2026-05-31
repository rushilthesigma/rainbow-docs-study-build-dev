/**
 * DataViz sample datasets - fully synthetic 3D scalar fields sampled on a
 * structured grid, plus a CSV point-cloud parser. Each point carries a scalar
 * `s` that the visualization colors by.
 */
export interface DataPoint {
  x: number;
  y: number;
  z: number;
  s: number;
}

export interface Dataset {
  id: string;
  name: string;
  points: DataPoint[];
  /** scalar field name */
  scalarName: string;
}

export const DATASET_DEFS: { id: string; name: string; scalarName: string }[] = [
  { id: 'gaussian', name: 'Gaussian Hill', scalarName: 'amplitude' },
  { id: 'ripple', name: 'Radial Ripple', scalarName: 'displacement' },
  { id: 'saddle', name: 'Saddle Surface', scalarName: 'z' },
  { id: 'turbulence', name: 'Turbulence Cube', scalarName: 'vorticity' },
  { id: 'dipole', name: 'Magnetic Dipole', scalarName: '|B|' },
  { id: 'thermal', name: 'Thermal Plume', scalarName: 'temperature' },
];

function noise3(x: number, y: number, z: number): number {
  // cheap value-noise-ish sum of sines
  return (
    Math.sin(x * 1.7 + Math.cos(y * 1.3)) *
      Math.cos(y * 1.9 + Math.sin(z * 1.1)) *
      Math.sin(z * 1.5 + Math.cos(x * 0.7)) +
    0.5 * Math.sin((x + y + z) * 2.3)
  );
}

export function buildDataset(id: string, res = 26): Dataset {
  const def = DATASET_DEFS.find((d) => d.id === id) ?? DATASET_DEFS[0];
  const pts: DataPoint[] = [];
  const span = 4;
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      for (let k = 0; k < res; k++) {
        const x = (i / (res - 1) - 0.5) * span;
        const y = (j / (res - 1) - 0.5) * span;
        const z = (k / (res - 1) - 0.5) * span;
        let s = 0;
        switch (def.id) {
          case 'gaussian':
            s = Math.exp(-(x * x + y * y + z * z) / 2.2);
            break;
          case 'ripple': {
            const r = Math.hypot(x, y, z);
            s = Math.sin(r * 3) / (1 + r);
            break;
          }
          case 'saddle':
            s = (x * x - y * y) * 0.25 + 0.1 * z;
            break;
          case 'turbulence':
            s = noise3(x, y, z);
            break;
          case 'dipole': {
            const r1 = Math.hypot(x, y, z - 1) + 0.3;
            const r2 = Math.hypot(x, y, z + 1) + 0.3;
            s = 1 / (r1 * r1) - 1 / (r2 * r2);
            break;
          }
          case 'thermal':
            s =
              Math.exp(-(x * x + (z + 1.5) * (z + 1.5)) / 1.5) *
                Math.max(0, 1 - (y + 2) / 4) +
              0.15 * noise3(x * 2, y, z * 2);
            break;
        }
        pts.push({ x, y, z, s });
      }
    }
  }
  return { id: def.id, name: def.name, points: pts, scalarName: def.scalarName };
}

/** Parse CSV with columns x,y,z,scalar (header optional). */
export function parseCSV(text: string): Dataset {
  const rows = text.trim().split(/\r?\n/);
  let start = 0;
  if (rows[0] && /[a-df-zA-DF-Z]/.test(rows[0].replace(/e[+-]?\d/gi, ''))) start = 1;
  const points: DataPoint[] = [];
  for (let i = start; i < rows.length; i++) {
    const c = rows[i].split(/[,\s;]+/).map(Number);
    if (c.length >= 3 && c.every((v) => Number.isFinite(v))) {
      points.push({ x: c[0], y: c[1], z: c[2], s: c[3] ?? c[2] });
    }
  }
  return { id: 'csv', name: 'Imported CSV', points, scalarName: 'scalar' };
}

export function scalarStats(pts: DataPoint[]): {
  min: number;
  max: number;
  mean: number;
  count: number;
} {
  if (!pts.length) return { min: 0, max: 1, mean: 0, count: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const p of pts) {
    if (p.s < min) min = p.s;
    if (p.s > max) max = p.s;
    sum += p.s;
  }
  return { min, max, mean: sum / pts.length, count: pts.length };
}

export function histogram(pts: DataPoint[], bins = 24): number[] {
  const { min, max } = scalarStats(pts);
  const h = new Array(bins).fill(0);
  const span = max - min || 1;
  for (const p of pts) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(((p.s - min) / span) * bins)));
    h[b]++;
  }
  return h;
}
