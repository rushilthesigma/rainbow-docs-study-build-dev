export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x = 0, y = 0): Vec2 => ({ x, y });
export const vclone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vscale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const vdot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** 2D scalar cross: a × b = ax*by - ay*bx */
export const vcross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
/** Cross of scalar w with vector b — useful for r × F = w * perp(r). */
export const vcrossSV = (s: number, b: Vec2): Vec2 => ({ x: -s * b.y, y: s * b.x });
export const vlen = (a: Vec2): number => Math.hypot(a.x, a.y);
export const vlenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const vnorm = (a: Vec2): Vec2 => {
  const L = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / L, y: a.y / L };
};
export const vperp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function rotate(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const aabbOverlap = (a: AABB, b: AABB): boolean =>
  a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;

export const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;
