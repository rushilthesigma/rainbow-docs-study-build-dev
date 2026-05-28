export type Bit = 0 | 1 | 'z' | 'x';

export type GateType =
  | 'input'
  | 'output'
  | 'not'
  | 'and'
  | 'or'
  | 'nand'
  | 'nor'
  | 'xor'
  | 'xnor'
  | 'clock'
  | 'seg7';

export interface PinDef {
  /** local name, e.g. "a", "b", "out" */
  name: string;
  /** kind */
  kind: 'in' | 'out';
  /** position relative to component (x,y in component-local pixels) */
  x: number;
  y: number;
}

export interface ComponentSpec {
  type: GateType;
  label: string;
  /** Component bounding box width/height in canvas pixels */
  width: number;
  height: number;
  /** Pin definitions (positions relative to top-left) */
  pins: PinDef[];
  /** Default per-component state */
  defaultState?: Record<string, unknown>;
  /** Mnemonic shape character drawn in the body */
  symbol?: string;
}

export interface Component {
  id: string;
  type: GateType;
  x: number;
  y: number;
  /** Per-component runtime state. Inputs: { value: 0|1 }. Clocks: { hz, phase }. */
  state: Record<string, unknown>;
}

export interface Connection {
  id: string;
  /** `${componentId}:${pinName}` */
  from: string;
  to: string;
}

export interface Circuit {
  components: Component[];
  connections: Connection[];
  /** Viewport saved with the circuit (optional) */
  viewport?: { x: number; y: number; zoom: number };
}

export function pinId(componentId: string, pinName: string): string {
  return `${componentId}:${pinName}`;
}

export function parsePin(id: string): { componentId: string; pinName: string } {
  const i = id.lastIndexOf(':');
  return { componentId: id.slice(0, i), pinName: id.slice(i + 1) };
}
