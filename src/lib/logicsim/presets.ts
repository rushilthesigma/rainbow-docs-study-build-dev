/**
 * Preset LogicLab circuits. Each preset is a tiny scene that drops onto an
 * empty canvas via the store's load() function. Component ids are pre-baked
 * because the truth-table generator and AI tools just iterate them anyway.
 */
import type { Circuit, GateType } from './types';
import { SPECS } from './gates';

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => Circuit;
}

let seq = 1;
const uid = (t: GateType) => `${t}-p${(seq++).toString(36)}`;

interface CompSpec {
  id?: string;
  type: GateType;
  x: number;
  y: number;
  state?: Record<string, unknown>;
}

function build(comps: CompSpec[], wires: Array<[string, string]>): Circuit {
  const components = comps.map((c) => ({
    id: c.id ?? uid(c.type),
    type: c.type,
    x: c.x,
    y: c.y,
    state: { ...(SPECS[c.type].defaultState ?? {}), ...(c.state ?? {}) },
  }));
  const connections = wires.map(([from, to], i) => ({
    id: `w-${i}-${Date.now().toString(36)}`,
    from,
    to,
  }));
  return { components, connections };
}

const halfAdder: Preset = {
  id: 'half-adder',
  name: 'Half Adder',
  description: 'Sum = A XOR B, Carry = A AND B.',
  build: () =>
    build(
      [
        { id: 'a', type: 'input', x: 60, y: 80 },
        { id: 'b', type: 'input', x: 60, y: 160 },
        { id: 'xor1', type: 'xor', x: 200, y: 90 },
        { id: 'and1', type: 'and', x: 200, y: 170 },
        { id: 'sum', type: 'output', x: 320, y: 100 },
        { id: 'carry', type: 'output', x: 320, y: 180 },
      ],
      [
        ['a:out', 'xor1:a'],
        ['b:out', 'xor1:b'],
        ['a:out', 'and1:a'],
        ['b:out', 'and1:b'],
        ['xor1:out', 'sum:in'],
        ['and1:out', 'carry:in'],
      ],
    ),
};

const fullAdder: Preset = {
  id: 'full-adder',
  name: 'Full Adder',
  description: 'A + B + Cin → Sum, Cout. Two half-adders + an OR.',
  build: () =>
    build(
      [
        { id: 'a', type: 'input', x: 40, y: 80 },
        { id: 'b', type: 'input', x: 40, y: 160 },
        { id: 'cin', type: 'input', x: 40, y: 240 },
        { id: 'xor1', type: 'xor', x: 180, y: 100 },
        { id: 'and1', type: 'and', x: 180, y: 180 },
        { id: 'xor2', type: 'xor', x: 320, y: 140 },
        { id: 'and2', type: 'and', x: 320, y: 220 },
        { id: 'or1', type: 'or', x: 460, y: 200 },
        { id: 'sum', type: 'output', x: 600, y: 150 },
        { id: 'cout', type: 'output', x: 600, y: 220 },
      ],
      [
        ['a:out', 'xor1:a'],
        ['b:out', 'xor1:b'],
        ['a:out', 'and1:a'],
        ['b:out', 'and1:b'],
        ['xor1:out', 'xor2:a'],
        ['cin:out', 'xor2:b'],
        ['xor1:out', 'and2:a'],
        ['cin:out', 'and2:b'],
        ['and1:out', 'or1:a'],
        ['and2:out', 'or1:b'],
        ['xor2:out', 'sum:in'],
        ['or1:out', 'cout:in'],
      ],
    ),
};

const srLatch: Preset = {
  id: 'sr-latch',
  name: 'SR Latch (NOR)',
  description: 'Cross-coupled NOR gates - classic set/reset memory cell.',
  build: () =>
    build(
      [
        { id: 's', type: 'input', x: 40, y: 80 },
        { id: 'r', type: 'input', x: 40, y: 240 },
        { id: 'nor1', type: 'nor', x: 220, y: 110 },
        { id: 'nor2', type: 'nor', x: 220, y: 210 },
        { id: 'q', type: 'output', x: 380, y: 120 },
        { id: 'qbar', type: 'output', x: 380, y: 220 },
      ],
      [
        ['s:out', 'nor1:a'],
        ['r:out', 'nor2:b'],
        ['nor1:out', 'nor2:a'],
        ['nor2:out', 'nor1:b'],
        ['nor1:out', 'q:in'],
        ['nor2:out', 'qbar:in'],
      ],
    ),
};

const mux2to1: Preset = {
  id: 'mux-2-1',
  name: '2-to-1 Multiplexer',
  description: 'Out = (A AND ¬Sel) OR (B AND Sel).',
  build: () =>
    build(
      [
        { id: 'a', type: 'input', x: 40, y: 80 },
        { id: 'b', type: 'input', x: 40, y: 160 },
        { id: 'sel', type: 'input', x: 40, y: 260 },
        { id: 'nots', type: 'not', x: 180, y: 260 },
        { id: 'and1', type: 'and', x: 280, y: 100 },
        { id: 'and2', type: 'and', x: 280, y: 180 },
        { id: 'or1', type: 'or', x: 420, y: 140 },
        { id: 'out', type: 'output', x: 540, y: 150 },
      ],
      [
        ['sel:out', 'nots:a'],
        ['a:out', 'and1:a'],
        ['nots:out', 'and1:b'],
        ['b:out', 'and2:a'],
        ['sel:out', 'and2:b'],
        ['and1:out', 'or1:a'],
        ['and2:out', 'or1:b'],
        ['or1:out', 'out:in'],
      ],
    ),
};

const dFlipFlop: Preset = {
  id: 'd-flipflop',
  name: 'D Latch (level-sensitive)',
  description: 'D follows on enable=1, holds on enable=0. NAND construction.',
  build: () =>
    build(
      [
        { id: 'd', type: 'input', x: 40, y: 80 },
        { id: 'en', type: 'input', x: 40, y: 220 },
        { id: 'nand1', type: 'nand', x: 200, y: 100 },
        { id: 'notd', type: 'not', x: 140, y: 160 },
        { id: 'nand2', type: 'nand', x: 200, y: 180 },
        { id: 'nand3', type: 'nand', x: 360, y: 110 },
        { id: 'nand4', type: 'nand', x: 360, y: 200 },
        { id: 'q', type: 'output', x: 500, y: 120 },
        { id: 'qbar', type: 'output', x: 500, y: 210 },
      ],
      [
        ['d:out', 'nand1:a'],
        ['en:out', 'nand1:b'],
        ['d:out', 'notd:a'],
        ['notd:out', 'nand2:a'],
        ['en:out', 'nand2:b'],
        ['nand1:out', 'nand3:a'],
        ['nand4:out', 'nand3:b'],
        ['nand2:out', 'nand4:b'],
        ['nand3:out', 'nand4:a'],
        ['nand3:out', 'q:in'],
        ['nand4:out', 'qbar:in'],
      ],
    ),
};

const decoder2to4: Preset = {
  id: 'decoder-2-4',
  name: '2-to-4 Decoder',
  description: 'Two select lines drive one of four outputs high.',
  build: () =>
    build(
      [
        { id: 'a', type: 'input', x: 40, y: 100 },
        { id: 'b', type: 'input', x: 40, y: 220 },
        { id: 'na', type: 'not', x: 160, y: 100 },
        { id: 'nb', type: 'not', x: 160, y: 220 },
        { id: 'and0', type: 'and', x: 320, y: 80 },
        { id: 'and1', type: 'and', x: 320, y: 160 },
        { id: 'and2', type: 'and', x: 320, y: 240 },
        { id: 'and3', type: 'and', x: 320, y: 320 },
        { id: 'y0', type: 'output', x: 460, y: 90 },
        { id: 'y1', type: 'output', x: 460, y: 170 },
        { id: 'y2', type: 'output', x: 460, y: 250 },
        { id: 'y3', type: 'output', x: 460, y: 330 },
      ],
      [
        ['a:out', 'na:a'],
        ['b:out', 'nb:a'],
        ['na:out', 'and0:a'],
        ['nb:out', 'and0:b'],
        ['na:out', 'and1:a'],
        ['b:out', 'and1:b'],
        ['a:out', 'and2:a'],
        ['nb:out', 'and2:b'],
        ['a:out', 'and3:a'],
        ['b:out', 'and3:b'],
        ['and0:out', 'y0:in'],
        ['and1:out', 'y1:in'],
        ['and2:out', 'y2:in'],
        ['and3:out', 'y3:in'],
      ],
    ),
};

const blinker: Preset = {
  id: 'blinker',
  name: 'Blinker (clock + LED)',
  description: 'A 2 Hz clock driving an LED. Tweak Hz in the properties panel.',
  build: () =>
    build(
      [
        { id: 'clk', type: 'clock', x: 80, y: 120, state: { hz: 2 } },
        { id: 'led', type: 'output', x: 240, y: 120 },
      ],
      [['clk:out', 'led:in']],
    ),
};

const bcdSeg: Preset = {
  id: 'bcd-7seg',
  name: 'BCD → 7-Segment',
  description: 'Four switches drive the 4-bit BCD input of a 7-seg display.',
  build: () =>
    build(
      [
        { id: 'd3', type: 'input', x: 40, y: 60 },
        { id: 'd2', type: 'input', x: 40, y: 140 },
        { id: 'd1', type: 'input', x: 40, y: 220 },
        { id: 'd0', type: 'input', x: 40, y: 300 },
        { id: 'seg', type: 'seg7', x: 240, y: 120 },
      ],
      [
        ['d0:out', 'seg:d0'],
        ['d1:out', 'seg:d1'],
        ['d2:out', 'seg:d2'],
        ['d3:out', 'seg:d3'],
      ],
    ),
};

export const PRESETS: Preset[] = [
  halfAdder,
  fullAdder,
  srLatch,
  dFlipFlop,
  mux2to1,
  decoder2to4,
  blinker,
  bcdSeg,
];

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
