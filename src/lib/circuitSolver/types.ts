export type CompType =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'vsource'
  | 'isource'
  | 'vsource_ac'
  | 'battery'
  | 'diode'
  | 'led'
  | 'switch'
  | 'potentiometer'
  | 'lamp'
  | 'fuse'
  | 'voltmeter'
  | 'ammeter'
  | 'opamp'
  | 'ground'
  | 'wire';

export interface CircuitComp {
  id: string;
  type: CompType;
  /** Component pins — pinName → nodeId (resolved by wiring). Wires don't have nodes. */
  pins: Record<string, string>;
  /** UI position */
  x: number;
  y: number;
  /** rotation in 90° increments */
  rot?: 0 | 1 | 2 | 3;
  /** value depends on type: R Ω, C F, L H, V volts, I amps, etc. */
  value: number;
  /** AC frequency (for vsource_ac) */
  freq?: number;
  /** initial state for dynamic components */
  initial?: number;
  /** Manhattan routing waypoints (wire type only — locked bend points) */
  waypoints?: { x: number; y: number }[];
}

export interface AnalogCircuit {
  components: CircuitComp[];
  /** Each node has a list of pin references */
  nodes: string[];
}

export interface DCResult {
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
}

export interface TransientResult {
  /** Time samples in seconds */
  t: number[];
  /** node voltages over time, keyed by nodeId */
  nodeVoltages: Record<string, number[]>;
  /** branch currents over time, keyed by V/I/L component id */
  branchCurrents: Record<string, number[]>;
}
