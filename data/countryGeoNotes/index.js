// Preset "Geography of ..." notes for countries and first-level subdivisions,
// grouped by region. Region files are authored data (cues + markdown mainNotes
// + summary per preset); this index flattens them for the API.
import { AFRICA_A } from './africaA.js';
import { AFRICA_B } from './africaB.js';
import { ASIA_A } from './asiaA.js';
import { ASIA_B } from './asiaB.js';
import { EUROPE_A } from './europeA.js';
import { EUROPE_B } from './europeB.js';
import { AMERICAS_NORTH } from './americasNorth.js';
import { AMERICAS_SOUTH } from './americasSouth.js';
import { OCEANIA } from './oceania.js';
import { SUBDIVISION_GEO_NOTES } from './subdivisions.js';

export const COUNTRY_GEO_NOTES = [
  ...AFRICA_A, ...AFRICA_B,
  ...ASIA_A, ...ASIA_B,
  ...EUROPE_A, ...EUROPE_B,
  ...AMERICAS_NORTH, ...AMERICAS_SOUTH,
  ...OCEANIA,
  ...SUBDIVISION_GEO_NOTES,
];

export const COUNTRY_GEO_NOTES_BY_SLUG = Object.fromEntries(
  COUNTRY_GEO_NOTES.map(n => [n.slug, n])
);
