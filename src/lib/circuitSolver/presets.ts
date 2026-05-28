/**
 * CircuitSim preset circuits. Returns a list of components plus wires expressed
 * as CompType + position + pin connections by id. The store accepts these via
 * its add/connect methods.
 */
import type { CompType } from './types';

export interface PresetComp {
  id: string;
  type: CompType;
  x: number;
  y: number;
  value: number;
  freq?: number;
  /** switch closed (1) / pot wiper ratio (0..1) */
  initial?: number;
}

export interface CircuitPreset {
  id: string;
  name: string;
  description: string;
  components: PresetComp[];
  /** wire endpoints as `${id}.${pin}` pairs */
  wires: Array<[string, string]>;
  /** node names to auto-probe on the scope after load */
  probes?: string[];
}

export const CIRCUIT_PRESETS: CircuitPreset[] = [
  {
    id: 'voltage-divider',
    name: 'Voltage Divider',
    description: 'Two resistors split a 10 V source.',
    components: [
      { id: 'v1', type: 'vsource', x: 80, y: 100, value: 10 },
      { id: 'r1', type: 'resistor', x: 220, y: 60, value: 1000 },
      { id: 'r2', type: 'resistor', x: 220, y: 140, value: 1000 },
      { id: 'gnd', type: 'ground', x: 220, y: 220, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'r2.a'],
      ['r2.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rc-lowpass',
    name: 'RC Low-Pass',
    description: 'Series R + shunt C. Probe the cap node for the filtered output.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 1000 },
      { id: 'r1', type: 'resistor', x: 220, y: 80, value: 1000 },
      { id: 'c1', type: 'capacitor', x: 320, y: 160, value: 1e-6 },
      { id: 'gnd', type: 'ground', x: 320, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'c1.a'],
      ['c1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rl-highpass',
    name: 'RL High-Pass',
    description: 'Series L + shunt R. Inductor blocks DC, passes high frequencies.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 1000 },
      { id: 'l1', type: 'inductor', x: 220, y: 80, value: 10e-3 },
      { id: 'r1', type: 'resistor', x: 320, y: 160, value: 1000 },
      { id: 'gnd', type: 'ground', x: 320, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'l1.a'],
      ['l1.b', 'r1.a'],
      ['r1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rlc-tank',
    name: 'RLC Series Resonator',
    description: 'Try sweeping the AC source frequency around 1/(2π·√LC) ≈ 5 kHz.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 5000 },
      { id: 'r1', type: 'resistor', x: 200, y: 80, value: 100 },
      { id: 'l1', type: 'inductor', x: 320, y: 80, value: 1e-3 },
      { id: 'c1', type: 'capacitor', x: 440, y: 160, value: 1e-6 },
      { id: 'gnd', type: 'ground', x: 440, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'l1.a'],
      ['l1.b', 'c1.a'],
      ['c1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'half-wave-rect',
    name: 'Half-Wave Rectifier',
    description: 'Diode + load. Negative half-cycles get clipped.',
    components: [
      { id: 'v1', type: 'vsource_ac', x: 80, y: 100, value: 5, freq: 60 },
      { id: 'd1', type: 'diode', x: 220, y: 80, value: 0 },
      { id: 'r1', type: 'resistor', x: 340, y: 160, value: 1000 },
      { id: 'gnd', type: 'ground', x: 340, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'd1.a'],
      ['d1.k', 'r1.a'],
      ['r1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'rc-charge',
    name: 'RC Charging',
    description: 'DC step charging a capacitor through R. τ = RC.',
    components: [
      { id: 'v1', type: 'vsource', x: 80, y: 100, value: 5 },
      { id: 'r1', type: 'resistor', x: 220, y: 80, value: 1000 },
      { id: 'c1', type: 'capacitor', x: 340, y: 160, value: 100e-6 },
      { id: 'gnd', type: 'ground', x: 340, y: 240, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.b', 'c1.a'],
      ['c1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'parallel-rl',
    name: 'Parallel RL Across DC',
    description: 'A resistor and inductor in parallel across a DC source.',
    components: [
      { id: 'v1', type: 'vsource', x: 80, y: 100, value: 12 },
      { id: 'r1', type: 'resistor', x: 220, y: 100, value: 100 },
      { id: 'l1', type: 'inductor', x: 320, y: 100, value: 50e-3 },
      { id: 'gnd', type: 'ground', x: 220, y: 220, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['r1.a', 'l1.a'],
      ['r1.b', 'v1.n'],
      ['l1.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'arduino-blink',
    name: 'Arduino: Blink LED',
    description: 'Pin D13 (5 V) → 220 Ω → LED → GND. The classic first sketch.',
    components: [
      { id: 'd13', type: 'vsource', x: 80, y: 110, value: 5 },
      { id: 'r1', type: 'resistor', x: 220, y: 80, value: 220 },
      { id: 'led', type: 'diode', x: 330, y: 150, value: 0 },
      { id: 'gnd', type: 'ground', x: 330, y: 240, value: 0 },
    ],
    wires: [
      ['d13.p', 'r1.a'],
      ['r1.b', 'led.a'],
      ['led.k', 'd13.n'],
      ['d13.n', 'gnd.p'],
    ],
  },
  {
    id: 'arduino-analog-read',
    name: 'Arduino: analogRead Divider',
    description: '5 V → 10 kΩ → A0 node → 10 kΩ sensor → GND. Probe A0.',
    components: [
      { id: 'v5', type: 'vsource', x: 80, y: 110, value: 5 },
      { id: 'rfix', type: 'resistor', x: 220, y: 70, value: 10000 },
      { id: 'rsens', type: 'resistor', x: 220, y: 160, value: 10000 },
      { id: 'gnd', type: 'ground', x: 220, y: 250, value: 0 },
    ],
    wires: [
      ['v5.p', 'rfix.a'],
      ['rfix.b', 'rsens.a'],
      ['rsens.b', 'v5.n'],
      ['v5.n', 'gnd.p'],
    ],
  },
  {
    id: 'arduino-pwm-rc',
    name: 'Arduino: PWM → RC Smoothing',
    description: 'analogWrite() PWM through an RC low-pass to make a real analog DAC.',
    components: [
      { id: 'pwm', type: 'vsource_ac', x: 80, y: 110, value: 5, freq: 490 },
      { id: 'r1', type: 'resistor', x: 220, y: 80, value: 4700 },
      { id: 'c1', type: 'capacitor', x: 330, y: 160, value: 10e-6 },
      { id: 'gnd', type: 'ground', x: 330, y: 240, value: 0 },
    ],
    wires: [
      ['pwm.p', 'r1.a'],
      ['r1.b', 'c1.a'],
      ['c1.b', 'pwm.n'],
      ['pwm.n', 'gnd.p'],
    ],
  },
  {
    id: 'wheatstone-bridge',
    name: 'Wheatstone Bridge',
    description: 'Four-resistor bridge — strain-gauge / sensor front-end. Probe both arms.',
    components: [
      { id: 'v1', type: 'vsource', x: 70, y: 150, value: 5 },
      { id: 'r1', type: 'resistor', x: 200, y: 70, value: 1000 },
      { id: 'r2', type: 'resistor', x: 200, y: 230, value: 1000 },
      { id: 'r3', type: 'resistor', x: 340, y: 70, value: 1000 },
      { id: 'r4', type: 'resistor', x: 340, y: 230, value: 1100 },
      { id: 'gnd', type: 'ground', x: 270, y: 300, value: 0 },
    ],
    wires: [
      ['v1.p', 'r1.a'],
      ['v1.p', 'r3.a'],
      ['r1.b', 'r2.a'],
      ['r3.b', 'r4.a'],
      ['r2.b', 'v1.n'],
      ['r4.b', 'v1.n'],
      ['v1.n', 'gnd.p'],
    ],
  },
  {
    id: 'full-wave-rectifier',
    name: 'Full-Wave Bridge Rectifier',
    description: 'Four-diode bridge + smoothing cap. AC in, DC out.',
    components: [
      { id: 'ac', type: 'vsource_ac', x: 70, y: 150, value: 12, freq: 60 },
      { id: 'd1', type: 'diode', x: 200, y: 80, value: 0 },
      { id: 'd2', type: 'diode', x: 200, y: 230, value: 0 },
      { id: 'd3', type: 'diode', x: 320, y: 80, value: 0 },
      { id: 'd4', type: 'diode', x: 320, y: 230, value: 0 },
      { id: 'c1', type: 'capacitor', x: 430, y: 150, value: 470e-6 },
      { id: 'rl', type: 'resistor', x: 520, y: 150, value: 1000 },
      { id: 'gnd', type: 'ground', x: 430, y: 260, value: 0 },
    ],
    wires: [
      ['ac.p', 'd1.a'],
      ['ac.p', 'd4.k'],
      ['ac.n', 'd2.a'],
      ['ac.n', 'd3.k'],
      ['d1.k', 'd3.a'],
      ['d1.k', 'c1.a'],
      ['c1.a', 'rl.a'],
      ['d2.k', 'd4.a'],
      ['d2.k', 'c1.b'],
      ['c1.b', 'rl.b'],
      ['c1.b', 'gnd.p'],
    ],
  },
  {
    id: 'diode-clipper',
    name: 'Diode Clipper',
    description: 'Series R + shunt diode clamps the waveform — guitar-pedal style.',
    components: [
      { id: 'ac', type: 'vsource_ac', x: 80, y: 120, value: 5, freq: 1000 },
      { id: 'r1', type: 'resistor', x: 220, y: 90, value: 1000 },
      { id: 'd1', type: 'diode', x: 330, y: 170, value: 0 },
      { id: 'gnd', type: 'ground', x: 330, y: 250, value: 0 },
    ],
    wires: [
      ['ac.p', 'r1.a'],
      ['r1.b', 'd1.a'],
      ['d1.k', 'ac.n'],
      ['ac.n', 'gnd.p'],
    ],
  },
  {
    id: 'led-array',
    name: 'Arduino: 3-LED Array',
    description: 'Three LEDs, each with its own 330 Ω resistor, off the 5 V rail.',
    components: [
      { id: 'v5', type: 'vsource', x: 70, y: 170, value: 5 },
      { id: 'ra', type: 'resistor', x: 200, y: 70, value: 330 },
      { id: 'rb', type: 'resistor', x: 200, y: 160, value: 330 },
      { id: 'rc', type: 'resistor', x: 200, y: 250, value: 330 },
      { id: 'la', type: 'diode', x: 320, y: 70, value: 0 },
      { id: 'lb', type: 'diode', x: 320, y: 160, value: 0 },
      { id: 'lc', type: 'diode', x: 320, y: 250, value: 0 },
      { id: 'gnd', type: 'ground', x: 430, y: 320, value: 0 },
    ],
    wires: [
      ['v5.p', 'ra.a'],
      ['v5.p', 'rb.a'],
      ['v5.p', 'rc.a'],
      ['ra.b', 'la.a'],
      ['rb.b', 'lb.a'],
      ['rc.b', 'lc.a'],
      ['la.k', 'v5.n'],
      ['lb.k', 'v5.n'],
      ['lc.k', 'v5.n'],
      ['v5.n', 'gnd.p'],
    ],
  },
  {
    id: 'flashlight',
    name: 'Flashlight (battery + switch + LED)',
    description: 'Battery → switch → 220 Ω → LED → ground. Toggle the switch.',
    components: [
      { id: 'bat', type: 'battery', x: 70, y: 110, value: 9 },
      { id: 'sw', type: 'switch', x: 200, y: 80, value: 0, initial: 1 },
      { id: 'r1', type: 'resistor', x: 300, y: 80, value: 220 },
      { id: 'led', type: 'led', x: 400, y: 150, value: 0 },
      { id: 'gnd', type: 'ground', x: 400, y: 240, value: 0 },
    ],
    wires: [
      ['bat.p', 'sw.a'],
      ['sw.b', 'r1.a'],
      ['r1.b', 'led.a'],
      ['led.k', 'bat.n'],
      ['bat.n', 'gnd.p'],
    ],
  },
  {
    id: 'pot-dimmer',
    name: 'Potentiometer LED Dimmer',
    description: 'Wiper sets the series resistance to a lamp. Drag the wiper slider.',
    components: [
      { id: 'bat', type: 'battery', x: 70, y: 120, value: 9 },
      { id: 'pot', type: 'potentiometer', x: 210, y: 60, value: 10000, initial: 0.5 },
      { id: 'lamp', type: 'lamp', x: 340, y: 120, value: 200 },
      { id: 'gnd', type: 'ground', x: 340, y: 230, value: 0 },
    ],
    wires: [
      ['bat.p', 'pot.a'],
      ['pot.w', 'lamp.a'],
      ['lamp.b', 'bat.n'],
      ['bat.n', 'gnd.p'],
    ],
  },
  {
    id: 'opamp-follower',
    name: 'Op-Amp Voltage Follower',
    description: 'Ideal op-amp buffer: output tracks the input. Probe in vs out.',
    components: [
      { id: 'vin', type: 'vsource', x: 70, y: 80, value: 3 },
      { id: 'oa', type: 'opamp', x: 230, y: 80, value: 0 },
      { id: 'rl', type: 'resistor', x: 360, y: 150, value: 10000 },
      { id: 'gnd', type: 'ground', x: 230, y: 240, value: 0 },
    ],
    wires: [
      ['vin.p', 'oa.p'],
      ['oa.o', 'oa.n'],
      ['oa.o', 'rl.a'],
      ['rl.b', 'vin.n'],
      ['vin.n', 'gnd.p'],
    ],
  },
];
