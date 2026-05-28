/** Scientific colormaps for DataViz (stops sampled from the well-known maps). */
export type ColormapId = 'viridis' | 'turbo' | 'coolwarm' | 'plasma' | 'grayscale';

const MAPS: Record<ColormapId, [number, number, number][]> = {
  viridis: [
    [0.27, 0.0, 0.33],
    [0.23, 0.32, 0.55],
    [0.13, 0.57, 0.55],
    [0.37, 0.79, 0.38],
    [0.99, 0.91, 0.14],
  ],
  turbo: [
    [0.19, 0.07, 0.23],
    [0.13, 0.56, 0.93],
    [0.16, 0.86, 0.4],
    [0.95, 0.74, 0.15],
    [0.86, 0.18, 0.13],
  ],
  coolwarm: [
    [0.23, 0.3, 0.75],
    [0.55, 0.69, 0.96],
    [0.87, 0.87, 0.87],
    [0.95, 0.6, 0.48],
    [0.71, 0.02, 0.15],
  ],
  plasma: [
    [0.05, 0.03, 0.53],
    [0.43, 0.0, 0.66],
    [0.74, 0.21, 0.48],
    [0.95, 0.5, 0.23],
    [0.94, 0.97, 0.13],
  ],
  grayscale: [
    [0.08, 0.08, 0.08],
    [0.3, 0.3, 0.3],
    [0.55, 0.55, 0.55],
    [0.78, 0.78, 0.78],
    [0.98, 0.98, 0.98],
  ],
};

export const COLORMAP_IDS: ColormapId[] = [
  'viridis',
  'turbo',
  'coolwarm',
  'plasma',
  'grayscale',
];

export function sampleColormap(
  id: ColormapId,
  t: number,
  out: { r: number; g: number; b: number },
) {
  const stops = MAPS[id] ?? MAPS.viridis;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const f = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const k = f - i;
  const a = stops[i];
  const b = stops[i + 1];
  out.r = a[0] + (b[0] - a[0]) * k;
  out.g = a[1] + (b[1] - a[1]) * k;
  out.b = a[2] + (b[2] - a[2]) * k;
}

/** CSS gradient string for legend bars. */
export function colormapCSS(id: ColormapId): string {
  const stops = MAPS[id] ?? MAPS.viridis;
  return `linear-gradient(90deg, ${stops
    .map(
      (c, i) =>
        `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0}) ${(
          (i / (stops.length - 1)) *
          100
        ).toFixed(0)}%`,
    )
    .join(', ')})`;
}
