// Minimal Conway's Game of Life kernel — ported from EngOS's engine.ts.
//
// The grid is a flat Uint8Array of length W*H. step() walks every cell
// once, counts its 8 neighbours, applies B3/S23. Toroidal wrap is
// optional and is what the live wallpaper uses to keep patterns moving
// even when they drift off the edge.

export function makeGrid(W, H, wrap = false) {
  return { W, H, cells: new Uint8Array(W * H), wrap };
}

export function randomFill(g, p = 0.25) {
  for (let i = 0; i < g.cells.length; i++) g.cells[i] = Math.random() < p ? 1 : 0;
}

const NX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NY = [-1, -1, -1, 0, 0, 1, 1, 1];

export function step(g, out) {
  const dest = out ?? new Uint8Array(g.cells.length);
  const { W, H, cells, wrap } = g;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let k = 0; k < 8; k++) {
        let nx = x + NX[k];
        let ny = y + NY[k];
        if (wrap) {
          if (nx < 0) nx += W; else if (nx >= W) nx -= W;
          if (ny < 0) ny += H; else if (ny >= H) ny -= H;
        } else if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
          continue;
        }
        if (cells[ny * W + nx]) n++;
      }
      const alive = cells[y * W + x] === 1;
      // Standard B3/S23: a live cell with 2-3 neighbours survives; a dead
      // cell with exactly 3 neighbours is born. Everything else dies / stays
      // dead.
      dest[y * W + x] = (alive ? (n === 2 || n === 3) : n === 3) ? 1 : 0;
    }
  }
  return dest;
}
