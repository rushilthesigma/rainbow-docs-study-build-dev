/**
 * Conway's Game of Life — minimal kernel + a pattern library.
 *
 * The grid is a flat Uint8Array of length W*H. step() walks every cell once,
 * counting its 8 neighbours and applying B3/S23. Toroidal wrap is optional.
 */

export interface ConwayGrid {
  W: number;
  H: number;
  cells: Uint8Array;
  wrap: boolean;
}

export function makeGrid(W: number, H: number, wrap = false): ConwayGrid {
  return { W, H, cells: new Uint8Array(W * H), wrap };
}

export function clear(g: ConwayGrid) {
  g.cells.fill(0);
}

export function randomFill(g: ConwayGrid, p = 0.25) {
  for (let i = 0; i < g.cells.length; i++) g.cells[i] = Math.random() < p ? 1 : 0;
}

export function getCell(g: ConwayGrid, x: number, y: number): 0 | 1 {
  if (g.wrap) {
    x = ((x % g.W) + g.W) % g.W;
    y = ((y % g.H) + g.H) % g.H;
  } else if (x < 0 || y < 0 || x >= g.W || y >= g.H) {
    return 0;
  }
  return g.cells[y * g.W + x] ? 1 : 0;
}

export function setCell(g: ConwayGrid, x: number, y: number, v: 0 | 1) {
  if (x < 0 || y < 0 || x >= g.W || y >= g.H) return;
  g.cells[y * g.W + x] = v;
}

export function toggleCell(g: ConwayGrid, x: number, y: number) {
  if (x < 0 || y < 0 || x >= g.W || y >= g.H) return;
  const idx = y * g.W + x;
  g.cells[idx] = g.cells[idx] ? 0 : 1;
}

const NX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NY = [-1, -1, -1, 0, 0, 1, 1, 1];

export function step(g: ConwayGrid, out?: Uint8Array): Uint8Array {
  const dest = out ?? new Uint8Array(g.cells.length);
  const { W, H, cells, wrap } = g;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let k = 0; k < 8; k++) {
        let nx = x + NX[k];
        let ny = y + NY[k];
        if (wrap) {
          if (nx < 0) nx += W;
          else if (nx >= W) nx -= W;
          if (ny < 0) ny += H;
          else if (ny >= H) ny -= H;
        } else if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
          continue;
        }
        if (cells[ny * W + nx]) n++;
      }
      const alive = cells[y * W + x];
      dest[y * W + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  return dest;
}

/** Stamp an array of (x, y) live cells at offset (ox, oy). */
export function stamp(g: ConwayGrid, cells: Array<[number, number]>, ox = 0, oy = 0) {
  for (const [x, y] of cells) setCell(g, x + ox, y + oy, 1);
}

export function countAlive(g: ConwayGrid): number {
  let n = 0;
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i]) n++;
  return n;
}

/* ----- Pattern library ----- */

export interface Pattern {
  id: string;
  name: string;
  cells: Array<[number, number]>;
  /** width × height of the bounding box, for placement preview */
  w: number;
  h: number;
  category: 'still' | 'osc' | 'ship' | 'gun' | 'methuselah';
}

const block: Pattern = {
  id: 'block',
  name: 'Block',
  category: 'still',
  cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
  w: 2,
  h: 2,
};

const beehive: Pattern = {
  id: 'beehive',
  name: 'Beehive',
  category: 'still',
  cells: [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]],
  w: 4,
  h: 3,
};

const loaf: Pattern = {
  id: 'loaf',
  name: 'Loaf',
  category: 'still',
  cells: [
    [1, 0], [2, 0],
    [0, 1], [3, 1],
    [1, 2], [3, 2],
    [2, 3],
  ],
  w: 4,
  h: 4,
};

const blinker: Pattern = {
  id: 'blinker',
  name: 'Blinker',
  category: 'osc',
  cells: [[0, 0], [1, 0], [2, 0]],
  w: 3,
  h: 1,
};

const toad: Pattern = {
  id: 'toad',
  name: 'Toad',
  category: 'osc',
  cells: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]],
  w: 4,
  h: 2,
};

const beacon: Pattern = {
  id: 'beacon',
  name: 'Beacon',
  category: 'osc',
  cells: [
    [0, 0], [1, 0], [0, 1], [1, 1],
    [2, 2], [3, 2], [2, 3], [3, 3],
  ],
  w: 4,
  h: 4,
};

const pulsar: Pattern = {
  id: 'pulsar',
  name: 'Pulsar',
  category: 'osc',
  cells: (() => {
    const c: Array<[number, number]> = [];
    const ring = (cx: number, cy: number) => {
      const dx = [2, 3, 4, 8, 9, 10];
      for (const d of dx) {
        c.push([cx + d, cy]);
        c.push([cx + d, cy + 12]);
      }
      const dy = [2, 3, 4, 8, 9, 10];
      for (const d of dy) {
        c.push([cx, cy + d]);
        c.push([cx + 12, cy + d]);
      }
      const corners = [
        [5, 0], [7, 0], [5, 12], [7, 12],
        [0, 5], [0, 7], [12, 5], [12, 7],
      ];
      for (const [a, b] of corners) c.push([cx + a, cy + b]);
    };
    ring(0, 0);
    return c;
  })(),
  w: 13,
  h: 13,
};

const glider: Pattern = {
  id: 'glider',
  name: 'Glider',
  category: 'ship',
  cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  w: 3,
  h: 3,
};

const lwss: Pattern = {
  id: 'lwss',
  name: 'Lightweight Spaceship',
  category: 'ship',
  cells: [
    [1, 0], [4, 0],
    [0, 1],
    [0, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [3, 3],
  ],
  w: 5,
  h: 4,
};

const gosperGun: Pattern = {
  id: 'gosper',
  name: 'Gosper Glider Gun',
  category: 'gun',
  cells: [
    [24, 0],
    [22, 1], [24, 1],
    [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
    [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
    [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
    [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
    [10, 6], [16, 6], [24, 6],
    [11, 7], [15, 7],
    [12, 8], [13, 8],
  ],
  w: 36,
  h: 9,
};

const rPentomino: Pattern = {
  id: 'r-pentomino',
  name: 'R-Pentomino',
  category: 'methuselah',
  cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  w: 3,
  h: 3,
};

const diehard: Pattern = {
  id: 'diehard',
  name: 'Diehard',
  category: 'methuselah',
  cells: [
    [6, 0],
    [0, 1], [1, 1],
    [1, 2], [5, 2], [6, 2], [7, 2],
  ],
  w: 8,
  h: 3,
};

const acorn: Pattern = {
  id: 'acorn',
  name: 'Acorn',
  category: 'methuselah',
  cells: [
    [1, 0],
    [3, 1],
    [0, 2], [1, 2], [4, 2], [5, 2], [6, 2],
  ],
  w: 7,
  h: 3,
};

export const PATTERNS: Pattern[] = [
  block,
  beehive,
  loaf,
  blinker,
  toad,
  beacon,
  pulsar,
  glider,
  lwss,
  gosperGun,
  rPentomino,
  diehard,
  acorn,
];

export function findPattern(id: string): Pattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}
