import type { Bit, ComponentSpec, GateType } from './types';

const W = 60;
const H = 40;

export const SPECS: Record<GateType, ComponentSpec> = {
  input: {
    type: 'input',
    label: 'Input',
    width: 44,
    height: 28,
    pins: [{ name: 'out', kind: 'out', x: 44, y: 14 }],
    defaultState: { value: 0 },
    symbol: '▶',
  },
  output: {
    type: 'output',
    label: 'LED',
    width: 36,
    height: 36,
    pins: [{ name: 'in', kind: 'in', x: 0, y: 18 }],
    defaultState: { value: 0 },
    symbol: '◉',
  },
  not: {
    type: 'not',
    label: 'NOT',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: H / 2 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '¬',
  },
  and: {
    type: 'and',
    label: 'AND',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: 10 },
      { name: 'b', kind: 'in', x: 0, y: H - 10 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '&',
  },
  or: {
    type: 'or',
    label: 'OR',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: 10 },
      { name: 'b', kind: 'in', x: 0, y: H - 10 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '≥1',
  },
  nand: {
    type: 'nand',
    label: 'NAND',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: 10 },
      { name: 'b', kind: 'in', x: 0, y: H - 10 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '&̄',
  },
  nor: {
    type: 'nor',
    label: 'NOR',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: 10 },
      { name: 'b', kind: 'in', x: 0, y: H - 10 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '≥1̄',
  },
  xor: {
    type: 'xor',
    label: 'XOR',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: 10 },
      { name: 'b', kind: 'in', x: 0, y: H - 10 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '=1',
  },
  xnor: {
    type: 'xnor',
    label: 'XNOR',
    width: W,
    height: H,
    pins: [
      { name: 'a', kind: 'in', x: 0, y: 10 },
      { name: 'b', kind: 'in', x: 0, y: H - 10 },
      { name: 'out', kind: 'out', x: W, y: H / 2 },
    ],
    symbol: '=1̄',
  },
  clock: {
    type: 'clock',
    label: 'Clock',
    width: 52,
    height: 32,
    pins: [{ name: 'out', kind: 'out', x: 52, y: 16 }],
    defaultState: { hz: 2, phase: 0 },
    symbol: '⏱',
  },
  seg7: {
    type: 'seg7',
    label: '7-Seg',
    width: 60,
    height: 80,
    pins: [
      { name: 'd0', kind: 'in', x: 0, y: 15 },
      { name: 'd1', kind: 'in', x: 0, y: 33 },
      { name: 'd2', kind: 'in', x: 0, y: 51 },
      { name: 'd3', kind: 'in', x: 0, y: 69 },
    ],
    symbol: '8',
  },
};

export const PALETTE: GateType[] = [
  'input',
  'output',
  'and',
  'or',
  'not',
  'nand',
  'nor',
  'xor',
  'xnor',
  'clock',
  'seg7',
];

/**
 * Combinational compute. Given the values on a component's input pins (keyed
 * by pinName), return the values to set on each output pin.
 *
 * Sequential components (input/clock) compute outputs purely from `state`.
 */
export function compute(
  type: GateType,
  inputs: Record<string, Bit>,
  state: Record<string, unknown>,
): Record<string, Bit> {
  switch (type) {
    case 'input': {
      const v = (state.value as Bit) ?? 0;
      return { out: v };
    }
    case 'output': {
      // Outputs are pure sinks but we mirror the input into state via the simulator
      return {};
    }
    case 'clock': {
      const v = (state.phase as Bit) ?? 0;
      return { out: v };
    }
    case 'seg7': {
      return {};
    }
    case 'not':
      return { out: bnot(inputs.a) };
    case 'and':
      return { out: band(inputs.a, inputs.b) };
    case 'or':
      return { out: bor(inputs.a, inputs.b) };
    case 'nand':
      return { out: bnot(band(inputs.a, inputs.b)) };
    case 'nor':
      return { out: bnot(bor(inputs.a, inputs.b)) };
    case 'xor':
      return { out: bxor(inputs.a, inputs.b) };
    case 'xnor':
      return { out: bnot(bxor(inputs.a, inputs.b)) };
  }
}

function bnot(a: Bit): Bit {
  if (a === 0) return 1;
  if (a === 1) return 0;
  return 'x';
}
function band(a: Bit, b: Bit): Bit {
  if (a === 0 || b === 0) return 0;
  if (a === 1 && b === 1) return 1;
  return 'x';
}
function bor(a: Bit, b: Bit): Bit {
  if (a === 1 || b === 1) return 1;
  if (a === 0 && b === 0) return 0;
  return 'x';
}
function bxor(a: Bit, b: Bit): Bit {
  if (a === 'x' || a === 'z' || b === 'x' || b === 'z') return 'x';
  return a === b ? 0 : 1;
}
