// Preset "Geography of <country>" notes, one per country, grouped by region.
// Region files are authored data (cues + markdown mainNotes + summary per
// country); this index flattens them for the /api/notes/presets endpoints.
import { AFRICA_A } from './africaA.js';
import { AFRICA_B } from './africaB.js';
import { ASIA_A } from './asiaA.js';
import { ASIA_B } from './asiaB.js';
import { EUROPE_A } from './europeA.js';
import { EUROPE_B } from './europeB.js';
import { AMERICAS_NORTH } from './americasNorth.js';
import { AMERICAS_SOUTH } from './americasSouth.js';
import { OCEANIA } from './oceania.js';

export const COUNTRY_GEO_NOTES = [
  ...AFRICA_A, ...AFRICA_B,
  ...ASIA_A, ...ASIA_B,
  ...EUROPE_A, ...EUROPE_B,
  ...AMERICAS_NORTH, ...AMERICAS_SOUTH,
  ...OCEANIA,
];

export const COUNTRY_GEO_NOTES_BY_SLUG = Object.fromEntries(
  COUNTRY_GEO_NOTES.map(n => [n.slug, n])
);
