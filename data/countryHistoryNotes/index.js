import { COUNTRY_GEO_NOTES } from '../countryGeoNotes/index.js';
import { GENERATED_COUNTRY_HISTORY_NOTES } from './countryHistoryNotesGenerated.js';
import {
  COUNTRY_HISTORY_SUBDIVISION_NOTES,
  COUNTRY_HISTORY_SUBDIVISION_NOTES_BY_SLUG,
} from './subdivisionHistory.js';

const countryMetadata = COUNTRY_GEO_NOTES.filter(note => note.category !== 'geo-subdivision');

export const COUNTRY_HISTORY_NOTES = countryMetadata.flatMap(country => {
  const slug = `history-${country.slug}`;
  const generated = GENERATED_COUNTRY_HISTORY_NOTES[slug];
  if (!generated) return [];
  return [{
    slug,
    category: 'history',
    country: country.country,
    region: country.region,
    subregion: country.subregion,
    title: `History of ${country.country}`,
    cues: generated.cues,
    mainNotes: generated.mainNotes,
    summary: generated.summary,
  }];
});

export const COUNTRY_HISTORY_NOTES_BY_SLUG = Object.fromEntries(
  COUNTRY_HISTORY_NOTES.map(note => [note.slug, note])
);

export {
  COUNTRY_HISTORY_SUBDIVISION_NOTES,
  COUNTRY_HISTORY_SUBDIVISION_NOTES_BY_SLUG,
};
