import type { Footprint, Pad } from './types';

function smPad(name: string, dx: number, dy: number, w = 1.2, h = 1.4): Pad {
  return { name, dx, dy, w, h, shape: 'roundrect', through: false };
}
function thPad(name: string, dx: number, dy: number, d = 1.6): Pad {
  return { name, dx, dy, w: d, h: d, shape: 'circle', through: true };
}

/** Two-pad chip (0805-ish) used for R / C / L / LED. */
function chip2(id: string, label: string, refPrefix: string, cat: Footprint['category']): Footprint {
  return {
    id,
    label,
    refPrefix,
    category: cat,
    body: { w: 2.0, h: 1.3 },
    pads: [smPad('1', -1.0, 0), smPad('2', 1.0, 0)],
  };
}

/** DIP IC with `n` pins (n even), 2.54 mm pitch, 7.62 mm row spacing. */
function dip(id: string, label: string, n: number): Footprint {
  const perSide = n / 2;
  const pitch = 2.54;
  const rowGap = 7.62;
  const pads: Pad[] = [];
  const startY = -((perSide - 1) * pitch) / 2;
  for (let i = 0; i < perSide; i++) {
    pads.push(thPad(String(i + 1), -rowGap / 2, startY + i * pitch));
  }
  for (let i = 0; i < perSide; i++) {
    pads.push(thPad(String(n - i), rowGap / 2, startY + i * pitch));
  }
  return {
    id,
    label,
    refPrefix: 'U',
    category: 'ic',
    body: { w: rowGap + 1.6, h: perSide * pitch + 1.2 },
    pads,
  };
}

/** Single-row pin header, `n` pins, 2.54 mm pitch. */
function header(id: string, label: string, n: number): Footprint {
  const pitch = 2.54;
  const startX = -((n - 1) * pitch) / 2;
  return {
    id,
    label,
    refPrefix: 'J',
    category: 'connector',
    body: { w: n * pitch, h: 2.6 },
    pads: Array.from({ length: n }, (_, i) => thPad(String(i + 1), startX + i * pitch, 0)),
  };
}

export const FOOTPRINTS: Footprint[] = [
  chip2('R-0805', 'Resistor 0805', 'R', 'passive'),
  chip2('C-0805', 'Capacitor 0805', 'C', 'passive'),
  chip2('L-0805', 'Inductor 0805', 'L', 'passive'),
  chip2('LED-0805', 'LED 0805', 'D', 'discrete'),
  {
    id: 'D-SOD123',
    label: 'Diode SOD-123',
    refPrefix: 'D',
    category: 'discrete',
    body: { w: 3.0, h: 1.8 },
    pads: [smPad('A', -1.6, 0), smPad('K', 1.6, 0)],
  },
  {
    id: 'Q-SOT23',
    label: 'Transistor SOT-23',
    refPrefix: 'Q',
    category: 'discrete',
    body: { w: 3.0, h: 3.0 },
    pads: [smPad('1', -0.95, 1.1, 0.9, 1.0), smPad('2', 0.95, 1.1, 0.9, 1.0), smPad('3', 0, -1.1, 0.9, 1.0)],
  },
  {
    id: 'C-ELEC',
    label: 'Electrolytic Cap',
    refPrefix: 'C',
    category: 'passive',
    body: { w: 6, h: 6 },
    pads: [thPad('+', -2.5, 0), thPad('-', 2.5, 0)],
  },
  {
    id: 'SW-TACT',
    label: 'Tactile Button',
    refPrefix: 'SW',
    category: 'discrete',
    body: { w: 6, h: 6 },
    pads: [
      thPad('1', -3, -2.2),
      thPad('2', 3, -2.2),
      thPad('3', -3, 2.2),
      thPad('4', 3, 2.2),
    ],
  },
  dip('U-DIP8', 'IC DIP-8', 8),
  dip('U-DIP14', 'IC DIP-14', 14),
  dip('U-DIP16', 'IC DIP-16', 16),
  header('J-1x2', 'Header 1×2', 2),
  header('J-1x4', 'Header 1×4', 4),
  header('J-1x8', 'Header 1×8', 8),
  {
    id: 'TP',
    label: 'Test Point',
    refPrefix: 'TP',
    category: 'power',
    body: { w: 2, h: 2 },
    pads: [thPad('1', 0, 0, 1.8)],
  },
];

export function getFootprint(id: string): Footprint | undefined {
  return FOOTPRINTS.find((f) => f.id === id);
}
