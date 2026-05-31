/**
 * Manhattan wire routing. Given start and end points, return an SVG path
 * string with right-angle bends.
 *
 * Strategy: leave the output pin horizontally for a short stub, route to the
 * input pin's X via one vertical and one horizontal segment.
 */

export interface Point {
  x: number;
  y: number;
}

const STUB = 12;

export function routeWire(a: Point, b: Point): string {
  // Horizontal stubs out of each pin (output goes right, input is approached from left)
  const aStub = { x: a.x + STUB, y: a.y };
  const bStub = { x: b.x - STUB, y: b.y };
  if (b.x - STUB > a.x + STUB) {
    // Plenty of room - route through midpoint
    const midX = (aStub.x + bStub.x) / 2;
    return [
      `M ${a.x},${a.y}`,
      `L ${aStub.x},${aStub.y}`,
      `L ${midX},${aStub.y}`,
      `L ${midX},${bStub.y}`,
      `L ${bStub.x},${bStub.y}`,
      `L ${b.x},${b.y}`,
    ].join(' ');
  }
  // Crossing back: route up/down around
  const aboveAB = a.y < b.y;
  const midY = aboveAB ? Math.min(a.y, b.y) - 24 : Math.max(a.y, b.y) + 24;
  return [
    `M ${a.x},${a.y}`,
    `L ${aStub.x},${aStub.y}`,
    `L ${aStub.x},${midY}`,
    `L ${bStub.x},${midY}`,
    `L ${bStub.x},${b.y}`,
    `L ${b.x},${b.y}`,
  ].join(' ');
}
