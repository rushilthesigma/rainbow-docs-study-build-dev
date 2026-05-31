/**
 * PCBForge data model - a deliberately small, fully-custom PCB representation
 * inspired by KiCad's concepts (footprints, pads, nets, copper layers) but
 * built from scratch for the web platform.
 */

export type LayerId = 'top-copper' | 'bottom-copper' | 'silkscreen' | 'edge';

export interface LayerDef {
  id: LayerId;
  label: string;
  color: string;
}

export const LAYERS: LayerDef[] = [
  { id: 'top-copper', label: 'Top Copper', color: '#e0533a' },
  { id: 'bottom-copper', label: 'Bottom Copper', color: '#3a7be0' },
  { id: 'silkscreen', label: 'Silkscreen', color: '#e8e8e8' },
  { id: 'edge', label: 'Edge Cuts', color: '#f5d36b' },
];

export type PadShape = 'rect' | 'circle' | 'roundrect';

export interface Pad {
  /** pad name as printed on the footprint, e.g. "1", "2", "A" */
  name: string;
  /** offset from the component origin, in mm */
  dx: number;
  dy: number;
  w: number;
  h: number;
  shape: PadShape;
  /** through-hole drilled pad (appears on both copper layers) */
  through: boolean;
}

export interface Footprint {
  id: string;
  label: string;
  /** Schematic-ish reference prefix, e.g. R, C, U, J, D, Q */
  refPrefix: string;
  /** body outline (silkscreen) as a rectangle in mm */
  body: { w: number; h: number };
  pads: Pad[];
  category: 'passive' | 'ic' | 'connector' | 'discrete' | 'power';
}

export interface PlacedComponent {
  id: string;
  footprintId: string;
  ref: string;
  value: string;
  x: number;
  y: number;
  /** rotation in degrees (0/90/180/270) */
  rot: number;
  layer: 'top-copper' | 'bottom-copper';
}

export interface TraceNode {
  /** `${componentId}:${padName}` or a free junction id `j:<id>` */
  pin: string;
}

export interface Trace {
  id: string;
  layer: 'top-copper' | 'bottom-copper';
  width: number;
  /** polyline of points in mm */
  points: { x: number; y: number }[];
  /** the two endpoints' logical pins (for net inference) */
  a: string;
  b: string;
}

export interface Board {
  components: PlacedComponent[];
  traces: Trace[];
  /** board outline rectangle in mm */
  outline: { w: number; h: number };
  gridMm: number;
}

export function pinId(componentId: string, padName: string): string {
  return `${componentId}:${padName}`;
}

/** Rotate a pad offset by the component rotation (deg). */
export function rotateOffset(
  dx: number,
  dy: number,
  rot: number,
): { x: number; y: number } {
  const r = (rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}
