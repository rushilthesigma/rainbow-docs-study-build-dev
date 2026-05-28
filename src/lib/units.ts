/**
 * Engineering unit conversion. Each linear unit is stored as a factor relative
 * to the category's SI reference unit; e.g. for Length the SI is the meter.
 *
 * Temperature is non-linear and handled separately.
 */

export type CategoryId =
  | 'length'
  | 'mass'
  | 'force'
  | 'pressure'
  | 'energy'
  | 'power'
  | 'torque'
  | 'temperature'
  | 'angle'
  | 'time'
  | 'velocity'
  | 'acceleration'
  | 'area'
  | 'volume';

export interface Unit {
  /** Canonical unit id, e.g. "kpa" */
  id: string;
  /** Display label, e.g. "kPa" */
  label: string;
  /** Long name, e.g. "kilopascal" */
  name: string;
  /** Conversion factor: 1 unit = `factor` of the SI reference */
  factor: number;
}

export interface Category {
  id: CategoryId;
  label: string;
  /** Display name for the SI reference unit, just for the UI */
  siLabel: string;
  units: Unit[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'length',
    label: 'Length',
    siLabel: 'm',
    units: [
      { id: 'mm', label: 'mm', name: 'millimeter', factor: 1e-3 },
      { id: 'cm', label: 'cm', name: 'centimeter', factor: 1e-2 },
      { id: 'm', label: 'm', name: 'meter', factor: 1 },
      { id: 'km', label: 'km', name: 'kilometer', factor: 1e3 },
      { id: 'in', label: 'in', name: 'inch', factor: 0.0254 },
      { id: 'ft', label: 'ft', name: 'foot', factor: 0.3048 },
      { id: 'yd', label: 'yd', name: 'yard', factor: 0.9144 },
      { id: 'mi', label: 'mi', name: 'mile', factor: 1609.344 },
      { id: 'nmi', label: 'nmi', name: 'nautical mile', factor: 1852 },
      { id: 'um', label: 'µm', name: 'micrometer', factor: 1e-6 },
      { id: 'nm', label: 'nm', name: 'nanometer', factor: 1e-9 },
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    siLabel: 'kg',
    units: [
      { id: 'mg', label: 'mg', name: 'milligram', factor: 1e-6 },
      { id: 'g', label: 'g', name: 'gram', factor: 1e-3 },
      { id: 'kg', label: 'kg', name: 'kilogram', factor: 1 },
      { id: 't', label: 't', name: 'metric ton', factor: 1e3 },
      { id: 'lb', label: 'lb', name: 'pound', factor: 0.45359237 },
      { id: 'oz', label: 'oz', name: 'ounce', factor: 0.028349523125 },
      { id: 'slug', label: 'slug', name: 'slug', factor: 14.59390294 },
      { id: 'ton_us', label: 'ton (US)', name: 'short ton', factor: 907.18474 },
    ],
  },
  {
    id: 'force',
    label: 'Force',
    siLabel: 'N',
    units: [
      { id: 'n', label: 'N', name: 'newton', factor: 1 },
      { id: 'kn', label: 'kN', name: 'kilonewton', factor: 1e3 },
      { id: 'dyn', label: 'dyn', name: 'dyne', factor: 1e-5 },
      { id: 'lbf', label: 'lbf', name: 'pound-force', factor: 4.4482216152605 },
      { id: 'kgf', label: 'kgf', name: 'kilogram-force', factor: 9.80665 },
      { id: 'ozf', label: 'ozf', name: 'ounce-force', factor: 0.27801385 },
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    siLabel: 'Pa',
    units: [
      { id: 'pa', label: 'Pa', name: 'pascal', factor: 1 },
      { id: 'kpa', label: 'kPa', name: 'kilopascal', factor: 1e3 },
      { id: 'mpa', label: 'MPa', name: 'megapascal', factor: 1e6 },
      { id: 'gpa', label: 'GPa', name: 'gigapascal', factor: 1e9 },
      { id: 'bar', label: 'bar', name: 'bar', factor: 1e5 },
      { id: 'mbar', label: 'mbar', name: 'millibar', factor: 100 },
      { id: 'psi', label: 'psi', name: 'pound per square inch', factor: 6894.757293168 },
      { id: 'ksi', label: 'ksi', name: 'kilopound per square inch', factor: 6894757.293168 },
      { id: 'atm', label: 'atm', name: 'standard atmosphere', factor: 101325 },
      { id: 'torr', label: 'Torr', name: 'torr', factor: 133.322387415 },
      { id: 'mmhg', label: 'mmHg', name: 'millimeter of mercury', factor: 133.322387415 },
      { id: 'inhg', label: 'inHg', name: 'inch of mercury', factor: 3386.389 },
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    siLabel: 'J',
    units: [
      { id: 'j', label: 'J', name: 'joule', factor: 1 },
      { id: 'kj', label: 'kJ', name: 'kilojoule', factor: 1e3 },
      { id: 'mj', label: 'MJ', name: 'megajoule', factor: 1e6 },
      { id: 'cal', label: 'cal', name: 'calorie', factor: 4.184 },
      { id: 'kcal', label: 'kcal', name: 'kilocalorie', factor: 4184 },
      { id: 'wh', label: 'Wh', name: 'watt-hour', factor: 3600 },
      { id: 'kwh', label: 'kWh', name: 'kilowatt-hour', factor: 3.6e6 },
      { id: 'btu', label: 'BTU', name: 'British thermal unit', factor: 1055.05585262 },
      { id: 'ftlb', label: 'ft·lbf', name: 'foot-pound', factor: 1.355817948 },
      { id: 'ev', label: 'eV', name: 'electron-volt', factor: 1.602176634e-19 },
    ],
  },
  {
    id: 'power',
    label: 'Power',
    siLabel: 'W',
    units: [
      { id: 'w', label: 'W', name: 'watt', factor: 1 },
      { id: 'kw', label: 'kW', name: 'kilowatt', factor: 1e3 },
      { id: 'mw', label: 'MW', name: 'megawatt', factor: 1e6 },
      { id: 'hp', label: 'hp', name: 'mechanical horsepower', factor: 745.6998715822702 },
      { id: 'hp_m', label: 'PS', name: 'metric horsepower', factor: 735.49875 },
      { id: 'btuh', label: 'BTU/h', name: 'British thermal unit per hour', factor: 0.29307107 },
      { id: 'ftlb_s', label: 'ft·lbf/s', name: 'foot-pound per second', factor: 1.355817948 },
    ],
  },
  {
    id: 'torque',
    label: 'Torque',
    siLabel: 'N·m',
    units: [
      { id: 'nm', label: 'N·m', name: 'newton-meter', factor: 1 },
      { id: 'knm', label: 'kN·m', name: 'kilonewton-meter', factor: 1e3 },
      { id: 'lbft', label: 'lbf·ft', name: 'pound-foot', factor: 1.3558179483 },
      { id: 'lbin', label: 'lbf·in', name: 'pound-inch', factor: 0.1129848290 },
      { id: 'kgfcm', label: 'kgf·cm', name: 'kilogram-force centimeter', factor: 0.0980665 },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    siLabel: 'K',
    units: [
      { id: 'k', label: 'K', name: 'kelvin', factor: 1 },
      { id: 'c', label: '°C', name: 'celsius', factor: 1 },
      { id: 'f', label: '°F', name: 'fahrenheit', factor: 1 },
      { id: 'r', label: '°R', name: 'rankine', factor: 1 },
    ],
  },
  {
    id: 'angle',
    label: 'Angle',
    siLabel: 'rad',
    units: [
      { id: 'rad', label: 'rad', name: 'radian', factor: 1 },
      { id: 'deg', label: '°', name: 'degree', factor: Math.PI / 180 },
      { id: 'grad', label: 'gon', name: 'gradian', factor: Math.PI / 200 },
      { id: 'rev', label: 'rev', name: 'revolution', factor: Math.PI * 2 },
      { id: 'arcmin', label: "'", name: 'arcminute', factor: Math.PI / 10800 },
      { id: 'arcsec', label: '"', name: 'arcsecond', factor: Math.PI / 648000 },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    siLabel: 's',
    units: [
      { id: 'ns', label: 'ns', name: 'nanosecond', factor: 1e-9 },
      { id: 'us', label: 'µs', name: 'microsecond', factor: 1e-6 },
      { id: 'ms', label: 'ms', name: 'millisecond', factor: 1e-3 },
      { id: 's', label: 's', name: 'second', factor: 1 },
      { id: 'min', label: 'min', name: 'minute', factor: 60 },
      { id: 'h', label: 'h', name: 'hour', factor: 3600 },
      { id: 'd', label: 'd', name: 'day', factor: 86400 },
      { id: 'w', label: 'w', name: 'week', factor: 604800 },
      { id: 'yr', label: 'yr', name: 'year (365 d)', factor: 3.1536e7 },
    ],
  },
  {
    id: 'velocity',
    label: 'Velocity',
    siLabel: 'm/s',
    units: [
      { id: 'mps', label: 'm/s', name: 'meter per second', factor: 1 },
      { id: 'kmh', label: 'km/h', name: 'kilometer per hour', factor: 1 / 3.6 },
      { id: 'mph', label: 'mph', name: 'mile per hour', factor: 0.44704 },
      { id: 'fps', label: 'ft/s', name: 'foot per second', factor: 0.3048 },
      { id: 'kn', label: 'kn', name: 'knot', factor: 0.514444 },
      { id: 'mach', label: 'Mach', name: 'mach (sea level)', factor: 343 },
      { id: 'c', label: 'c', name: 'speed of light', factor: 299792458 },
    ],
  },
  {
    id: 'acceleration',
    label: 'Acceleration',
    siLabel: 'm/s²',
    units: [
      { id: 'mps2', label: 'm/s²', name: 'meter per second squared', factor: 1 },
      { id: 'g', label: 'g', name: 'standard gravity', factor: 9.80665 },
      { id: 'fps2', label: 'ft/s²', name: 'foot per second squared', factor: 0.3048 },
      { id: 'gal', label: 'Gal', name: 'galileo', factor: 0.01 },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    siLabel: 'm²',
    units: [
      { id: 'mm2', label: 'mm²', name: 'square millimeter', factor: 1e-6 },
      { id: 'cm2', label: 'cm²', name: 'square centimeter', factor: 1e-4 },
      { id: 'm2', label: 'm²', name: 'square meter', factor: 1 },
      { id: 'km2', label: 'km²', name: 'square kilometer', factor: 1e6 },
      { id: 'in2', label: 'in²', name: 'square inch', factor: 0.00064516 },
      { id: 'ft2', label: 'ft²', name: 'square foot', factor: 0.09290304 },
      { id: 'yd2', label: 'yd²', name: 'square yard', factor: 0.83612736 },
      { id: 'ac', label: 'ac', name: 'acre', factor: 4046.8564224 },
      { id: 'ha', label: 'ha', name: 'hectare', factor: 1e4 },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    siLabel: 'm³',
    units: [
      { id: 'ml', label: 'mL', name: 'milliliter', factor: 1e-6 },
      { id: 'l', label: 'L', name: 'liter', factor: 1e-3 },
      { id: 'cm3', label: 'cm³', name: 'cubic centimeter', factor: 1e-6 },
      { id: 'm3', label: 'm³', name: 'cubic meter', factor: 1 },
      { id: 'in3', label: 'in³', name: 'cubic inch', factor: 1.6387064e-5 },
      { id: 'ft3', label: 'ft³', name: 'cubic foot', factor: 0.028316846592 },
      { id: 'gal_us', label: 'gal (US)', name: 'US liquid gallon', factor: 0.003785411784 },
      { id: 'gal_uk', label: 'gal (UK)', name: 'UK gallon', factor: 0.00454609 },
      { id: 'qt', label: 'qt (US)', name: 'US quart', factor: 0.000946352946 },
      { id: 'pt', label: 'pt (US)', name: 'US pint', factor: 0.000473176473 },
    ],
  },
];

function tempToK(value: number, from: string): number {
  switch (from) {
    case 'k':
      return value;
    case 'c':
      return value + 273.15;
    case 'f':
      return (value - 32) * (5 / 9) + 273.15;
    case 'r':
      return value * (5 / 9);
  }
  throw new Error(`Unknown temperature unit ${from}`);
}

function tempFromK(kelvin: number, to: string): number {
  switch (to) {
    case 'k':
      return kelvin;
    case 'c':
      return kelvin - 273.15;
    case 'f':
      return (kelvin - 273.15) * (9 / 5) + 32;
    case 'r':
      return kelvin * (9 / 5);
  }
  throw new Error(`Unknown temperature unit ${to}`);
}

export function convert(value: number, from: string, to: string, category: CategoryId): number {
  if (category === 'temperature') {
    const k = tempToK(value, from);
    return tempFromK(k, to);
  }
  const cat = CATEGORIES.find((c) => c.id === category);
  if (!cat) throw new Error(`Unknown category ${category}`);
  const a = cat.units.find((u) => u.id === from);
  const b = cat.units.find((u) => u.id === to);
  if (!a || !b) throw new Error(`Unknown unit (${from} or ${to}) in ${category}`);
  return (value * a.factor) / b.factor;
}

export function getCategory(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown category ${id}`);
  return c;
}

/**
 * Search every category for a matching unit by id or label/name (case-insensitive).
 * Returns the first hit, or null. Useful for AI tool calls that don't specify
 * the category explicitly.
 */
export function findUnit(unit: string): { category: CategoryId; unit: Unit } | null {
  const needle = unit.trim().toLowerCase();
  for (const cat of CATEGORIES) {
    for (const u of cat.units) {
      if (
        u.id.toLowerCase() === needle ||
        u.label.toLowerCase() === needle ||
        u.name.toLowerCase() === needle
      ) {
        return { category: cat.id, unit: u };
      }
    }
  }
  return null;
}

export function formatValue(n: number, options: { precision: number; engineering?: boolean }): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n === 0) return '0';
  const p = Math.max(0, Math.min(15, options.precision));
  if (options.engineering) {
    if (n === 0) return '0';
    const exp = Math.floor(Math.log10(Math.abs(n)));
    const eng = Math.floor(exp / 3) * 3;
    const mantissa = n / Math.pow(10, eng);
    return `${mantissa.toFixed(p)}e${eng >= 0 ? '+' : ''}${eng}`;
  }
  const abs = Math.abs(n);
  if (abs >= 1e15 || (abs > 0 && abs < 1e-4)) return n.toExponential(p);
  return parseFloat(n.toPrecision(p + 1)).toString();
}
