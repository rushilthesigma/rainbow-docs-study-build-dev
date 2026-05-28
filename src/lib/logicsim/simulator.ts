import type { Bit, Circuit, Component, Connection } from './types';
import { pinId } from './types';
import { compute, SPECS } from './gates';

/**
 * Event-driven simulator state. Pin values are kept in a map keyed by
 * "${componentId}:${pinName}". On each `step()` we propagate values
 * iteratively until stable or until the iteration cap is reached, at which
 * point we mark every still-changing pin as oscillating.
 */
export interface SimState {
  pinValues: Map<string, Bit>;
  /** Components currently oscillating (id set) */
  oscillating: Set<string>;
  /** Connections currently driving an oscillating value */
  oscillatingConnections: Set<string>;
  /** Compiled adjacency: for each pin id, the pins it drives */
  outAdj: Map<string, string[]>;
  /** input pin → driving output pin */
  inAdj: Map<string, string>;
}

export function buildSim(circuit: Circuit): SimState {
  const pinValues = new Map<string, Bit>();
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string>();

  for (const c of circuit.components) {
    const spec = SPECS[c.type];
    for (const p of spec.pins) {
      pinValues.set(pinId(c.id, p.name), 0);
    }
  }
  for (const conn of circuit.connections) {
    if (!outAdj.has(conn.from)) outAdj.set(conn.from, []);
    outAdj.get(conn.from)!.push(conn.to);
    inAdj.set(conn.to, conn.from);
  }
  return {
    pinValues,
    oscillating: new Set(),
    oscillatingConnections: new Set(),
    outAdj,
    inAdj,
  };
}

const MAX_ITERATIONS = 50;

/**
 * BCD 0-9 segment patterns (gfedcba ordering as bit positions 6..0).
 * Values 10-15 are blanked (0).
 */
const SEG7_DECODE: Record<number, number> = {
  0: 0b0111111,
  1: 0b0000110,
  2: 0b1011011,
  3: 0b1001111,
  4: 0b1100110,
  5: 0b1101101,
  6: 0b1111101,
  7: 0b0000111,
  8: 0b1111111,
  9: 0b1101111,
};

/**
 * Run a single propagation pass: re-evaluate every component, write the new
 * output values, propagate them to connected inputs via the adjacency map,
 * loop until stable or oscillating.
 */
export function step(
  circuit: Circuit,
  sim: SimState,
  changedIds?: Set<string>,
): { changed: boolean; oscillating: string[] } {
  // Track per-component change counts to detect oscillation
  const changeCount = new Map<string, number>();
  let anyChange = false;
  let dirty: Set<string> = changedIds ?? new Set(circuit.components.map((c) => c.id));
  const ledMirror = new Set<string>();

  for (let iter = 0; iter < MAX_ITERATIONS && dirty.size > 0; iter++) {
    const nextDirty = new Set<string>();
    for (const compId of dirty) {
      const comp = circuit.components.find((c) => c.id === compId);
      if (!comp) continue;
      const spec = SPECS[comp.type];

      // Gather inputs by reading the driving output pin's value (or 'z' if unconnected)
      const inputs: Record<string, Bit> = {};
      for (const p of spec.pins) {
        if (p.kind === 'in') {
          const myPin = pinId(comp.id, p.name);
          const drv = sim.inAdj.get(myPin);
          inputs[p.name] = (drv ? sim.pinValues.get(drv) : 'z') ?? 'z';
        }
      }

      const outputs = compute(comp.type, inputs, comp.state);
      for (const p of spec.pins) {
        if (p.kind === 'out') {
          const id = pinId(comp.id, p.name);
          const v = outputs[p.name] ?? 'z';
          const prev = sim.pinValues.get(id);
          if (prev !== v) {
            sim.pinValues.set(id, v);
            anyChange = true;
            changeCount.set(comp.id, (changeCount.get(comp.id) ?? 0) + 1);
            // Schedule everyone we drive for re-eval
            const ds = sim.outAdj.get(id);
            if (ds) {
              for (const downstream of ds) {
                const downComp = downstream.split(':')[0];
                nextDirty.add(downComp);
              }
            }
          }
        }
      }

      // Sink components (LEDs / 7-seg): mirror current input value into state.value
      if (comp.type === 'output') {
        const inp = inputs['in'] ?? 0;
        if (comp.state.value !== inp) {
          comp.state.value = inp;
          ledMirror.add(comp.id);
        }
      } else if (comp.type === 'seg7') {
        const bits: number[] = [];
        for (const n of ['d3', 'd2', 'd1', 'd0']) {
          const v = inputs[n];
          bits.push(v === 1 ? 1 : 0);
        }
        const digit = (bits[0] << 3) | (bits[1] << 2) | (bits[2] << 1) | bits[3];
        const segs = SEG7_DECODE[digit] ?? 0;
        if (comp.state.segments !== segs) {
          comp.state.segments = segs;
          ledMirror.add(comp.id);
        }
      }
    }
    dirty = nextDirty;
  }

  const oscillating: string[] = [];
  for (const [compId, count] of changeCount) {
    if (count >= MAX_ITERATIONS / 4) oscillating.push(compId);
  }
  sim.oscillating = new Set(oscillating);

  // Mark connections from oscillating components as oscillating-colored
  sim.oscillatingConnections.clear();
  if (oscillating.length) {
    for (const conn of circuit.connections) {
      const driver = conn.from.split(':')[0];
      if (sim.oscillating.has(driver)) sim.oscillatingConnections.add(conn.id);
    }
  }

  return { changed: anyChange || ledMirror.size > 0, oscillating };
}

/**
 * Advance the simulation by `dt` seconds. Clocks tick at their `hz` rate.
 * Returns the set of component ids whose outputs changed so the caller can
 * re-run `step` with them as the dirty set.
 */
export function advanceClocks(circuit: Circuit, dt: number): Set<string> {
  const changed = new Set<string>();
  for (const c of circuit.components) {
    if (c.type !== 'clock') continue;
    const hz = (c.state.hz as number) ?? 1;
    const halfPeriod = 1 / (2 * Math.max(0.0001, hz));
    const t = (c.state._t as number) ?? 0;
    const next = t + dt;
    const wrapped = next % (2 * halfPeriod);
    c.state._t = wrapped;
    const wasPhase = (c.state.phase as Bit) ?? 0;
    const nowPhase: Bit = wrapped < halfPeriod ? 0 : 1;
    if (wasPhase !== nowPhase) {
      c.state.phase = nowPhase;
      changed.add(c.id);
    }
  }
  return changed;
}

/**
 * Identify inputs (INPUT components) and outputs (OUTPUT/LED components) for
 * truth-table generation.
 */
export function identifyIO(comps: Component[]): {
  inputs: Component[];
  outputs: Component[];
} {
  return {
    inputs: comps.filter((c) => c.type === 'input'),
    outputs: comps.filter((c) => c.type === 'output'),
  };
}

/**
 * Generate a complete truth table by enumerating all 2^N input combinations,
 * running the simulator to settle, and recording each output value.
 */
export function truthTable(circuit: Circuit): {
  inputs: Component[];
  outputs: Component[];
  rows: Array<{ inputs: Bit[]; outputs: Bit[] }>;
} {
  const { inputs, outputs } = identifyIO(circuit.components);
  const rows: Array<{ inputs: Bit[]; outputs: Bit[] }> = [];
  const n = inputs.length;
  if (n === 0 || outputs.length === 0) return { inputs, outputs, rows };
  const N = 1 << n;
  // Deep-clone the circuit so we don't trample live state
  const work: Circuit = JSON.parse(JSON.stringify(circuit));
  for (let mask = 0; mask < N; mask++) {
    const vals: Bit[] = [];
    for (let i = 0; i < n; i++) {
      const v: Bit = ((mask >> (n - 1 - i)) & 1) as Bit;
      vals.push(v);
      const target = work.components.find((c) => c.id === inputs[i].id)!;
      target.state.value = v;
    }
    const sim = buildSim(work);
    step(work, sim);
    const outVals = outputs.map((o) => {
      const target = work.components.find((c) => c.id === o.id)!;
      return (target.state.value as Bit) ?? 0;
    });
    rows.push({ inputs: vals, outputs: outVals });
  }
  return { inputs, outputs, rows };
}

export function pinExists(comps: Component[], id: string, kind: 'in' | 'out'): boolean {
  const [compId, pinName] = id.split(':');
  const comp = comps.find((c) => c.id === compId);
  if (!comp) return false;
  const spec = SPECS[comp.type];
  return spec.pins.some((p) => p.name === pinName && p.kind === kind);
}

export function findConflictingConnection(
  connections: Connection[],
  toPin: string,
): Connection | undefined {
  // Each input pin can only have one driver
  return connections.find((c) => c.to === toPin);
}
