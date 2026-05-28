import type { FeaModel } from './truss';

const STEEL_E = 2.1e11;
const A = 1e-4; // 1 cm²

function n(id: string, x: number, y: number, fixX = false, fixY = false) {
  return { id, x, y, fixX, fixY };
}
function e(id: string, a: string, b: string) {
  return { id, a, b, E: STEEL_E, A };
}

export interface FeaPreset {
  id: string;
  name: string;
  description: string;
  model: FeaModel;
}

export const FEA_PRESETS: FeaPreset[] = [
  {
    id: 'cantilever',
    name: 'Cantilever Truss',
    description: 'Wall-mounted truss with a tip load.',
    model: {
      nodes: [
        n('a', 0, 0, true, true),
        n('b', 0, 2, true, true),
        n('c', 3, 0),
        n('d', 3, 2),
        n('e', 6, 1),
      ],
      elements: [
        e('1', 'a', 'c'),
        e('2', 'b', 'd'),
        e('3', 'a', 'd'),
        e('4', 'c', 'd'),
        e('5', 'c', 'e'),
        e('6', 'd', 'e'),
        e('7', 'b', 'a'),
      ],
      loads: [{ node: 'e', fx: 0, fy: -5000 }],
    },
  },
  {
    id: 'pratt',
    name: 'Pratt Bridge Truss',
    description: 'Simply-supported Pratt truss, central load.',
    model: {
      nodes: [
        n('b0', 0, 0, true, true),
        n('b1', 2, 0),
        n('b2', 4, 0),
        n('b3', 6, 0),
        n('b4', 8, 0, false, true),
        n('t1', 2, 2),
        n('t2', 4, 2),
        n('t3', 6, 2),
      ],
      elements: [
        e('bc0', 'b0', 'b1'),
        e('bc1', 'b1', 'b2'),
        e('bc2', 'b2', 'b3'),
        e('bc3', 'b3', 'b4'),
        e('tc1', 't1', 't2'),
        e('tc2', 't2', 't3'),
        e('v1', 'b1', 't1'),
        e('v2', 'b2', 't2'),
        e('v3', 'b3', 't3'),
        e('d0', 'b0', 't1'),
        e('d1', 't1', 'b2'),
        e('d2', 'b2', 't3'),
        e('d3', 't3', 'b4'),
      ],
      loads: [{ node: 'b2', fx: 0, fy: -8000 }],
    },
  },
  {
    id: 'aframe',
    name: 'A-Frame',
    description: 'Two pinned feet, apex load.',
    model: {
      nodes: [
        n('l', 0, 0, true, true),
        n('r', 4, 0, true, true),
        n('apex', 2, 3),
        n('tie_l', 1, 1.5),
        n('tie_r', 3, 1.5),
      ],
      elements: [
        e('1', 'l', 'apex'),
        e('2', 'r', 'apex'),
        e('3', 'l', 'r'),
        e('4', 'tie_l', 'tie_r'),
        e('5', 'l', 'tie_l'),
        e('6', 'r', 'tie_r'),
      ],
      loads: [{ node: 'apex', fx: 1000, fy: -6000 }],
    },
  },
  {
    id: 'tower',
    name: 'Lattice Tower',
    description: 'Vertical lattice with lateral wind load.',
    model: {
      nodes: [
        n('a0', 0, 0, true, true),
        n('b0', 2, 0, true, true),
        n('a1', 0, 2),
        n('b1', 2, 2),
        n('a2', 0, 4),
        n('b2', 2, 4),
        n('a3', 0, 6),
        n('b3', 2, 6),
      ],
      elements: [
        e('la1', 'a0', 'a1'),
        e('la2', 'a1', 'a2'),
        e('la3', 'a2', 'a3'),
        e('lb1', 'b0', 'b1'),
        e('lb2', 'b1', 'b2'),
        e('lb3', 'b2', 'b3'),
        e('h1', 'a1', 'b1'),
        e('h2', 'a2', 'b2'),
        e('h3', 'a3', 'b3'),
        e('x1', 'a0', 'b1'),
        e('x2', 'b1', 'a2'),
        e('x3', 'a2', 'b3'),
      ],
      loads: [
        { node: 'a3', fx: 3000, fy: -1000 },
        { node: 'b3', fx: 3000, fy: -1000 },
      ],
    },
  },
];
