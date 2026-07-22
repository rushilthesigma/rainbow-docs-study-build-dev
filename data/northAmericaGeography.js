// Preset geography course covering the 23 sovereign states of North America.
// The source notes are shared with Notes and Quiz Bowl, so lessons, study
// materials, and retrieval practice all teach from the same country profiles.
import { AMERICAS_NORTH } from './countryGeoNotes/americasNorth.js';

const REGION_LABELS = {
  'North America': 'Northern America',
  'Central America': 'Central America',
  Caribbean: 'the Caribbean',
};

function lessonQuestions(cues, indexes) {
  const selected = indexes.map(index => cues[index]).filter(Boolean);
  return selected.length
    ? ` Key questions: ${selected.join(' ')}`
    : '';
}

function countryLessons(entry) {
  const { country, cues = [] } = entry;

  return [
    {
      title: `${country}: Location, Borders & Map Skills`,
      description: `Locate ${country}, identify its neighbors and surrounding waters, and connect its position, scale, and political map to the rest of North America.${lessonQuestions(cues, [0, 4])}`,
    },
    {
      title: `${country}: Landforms, Climate & Water`,
      description: `Explain the major mountains, plains, islands, climate zones, rivers, lakes, and coasts of ${country}, including how physical geography shapes settlement and risk.${lessonQuestions(cues, [1, 2, 3])}`,
    },
    {
      title: `${country}: Cities, People & Regional Connections`,
      description: `Match the capital and major cities of ${country} to their regions, then connect population patterns, language, culture, resources, and transportation to the country's geography.${lessonQuestions(cues, [4, 5])}`,
    },
  ];
}

const COUNTRY_UNITS = AMERICAS_NORTH.map(entry => ({
  title: entry.country,
  description: `${entry.summary} This unit places ${entry.country} within ${REGION_LABELS[entry.subregion] || entry.subregion}.`,
  textbookContext: `${entry.title}\n\n${entry.mainNotes}\n\n## Review Questions\n${entry.cues.map(cue => `- ${cue}`).join('\n')}\n\n## Summary\n${entry.summary}`,
  lessons: countryLessons(entry),
}));

const FINAL_REVIEW_CONTEXT = `NORTH AMERICA — REGIONAL SYNTHESIS (cumulative final-exam scope)

This review is cumulative across the 23 sovereign states in Northern America, Central America, and the Caribbean.

- Northern America: Canada, the United States, and Mexico. Compare the Canadian Shield, Great Plains, Appalachians, Rockies, Sierra Madre ranges, Arctic lands, deserts, major climate belts, and the Great Lakes–Saint Lawrence, Mississippi–Missouri, Colorado, and Rio Grande systems. Know Ottawa, Washington, D.C., Mexico City, and the major urban corridors.
- Central America: Belize, Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, and Panama. Trace the volcanic Central American isthmus, Caribbean and Pacific watersheds, major lakes, tropical climates, the Panama Canal, the Mesoamerican cultural region, and each country’s capital.
- The Greater Antilles: Cuba, Jamaica, Haiti, and the Dominican Republic. Compare the islands’ mountain chains, limestone landscapes, tropical climates, hurricane exposure, population centers, and the shared geography of Hispaniola.
- The Bahamas and Lesser Antilles: Bahamas, Antigua and Barbuda, Dominica, Saint Kitts and Nevis, Saint Lucia, Saint Vincent and the Grenadines, Grenada, Barbados, and Trinidad and Tobago. Distinguish coral-limestone islands from volcanic arcs, locate major channels and seas, and compare tourism, agriculture, energy, and natural hazards.

Be able to locate every country and capital, group countries by subregion and island chain, identify major landforms and waters, compare climate and hazard patterns, and explain how physical geography shapes settlement, transportation, culture, and economic activity.`;

const FINAL_EXAM_UNIT = {
  title: 'Final Exam — Comprehensive North American Geography',
  description: 'Cumulative regional review and assessment across all 23 countries: maps and capitals, physical systems, cities and people, and cross-border connections.',
  textbookContext: FINAL_REVIEW_CONTEXT,
  lessons: [
    {
      title: 'North America Review: Countries, Capitals & Subregions',
      description: 'Locate all 23 sovereign states and their capitals, then organize them into Northern America, Central America, the Greater Antilles, the Bahamas, and the Lesser Antilles.',
    },
    {
      title: 'North America Review: Landforms, Climate & Water Systems',
      description: 'Compare the continent’s mountain systems, plains, islands, climate belts, rivers, lakes, surrounding seas, hurricane zones, volcanoes, and tectonic boundaries.',
    },
    {
      title: 'North America Review: Cities, Culture & Connections',
      description: 'Synthesize urban patterns, language and culture, migration, trade routes, tourism, resources, and the geographic links that connect the continent’s subregions.',
    },
  ],
};

export const NORTH_AMERICA_GEOGRAPHY_COURSE = {
  slug: 'north-america-geography',
  title: 'North America Geography',
  description: 'A complete country-by-country course covering all 23 sovereign states of Northern America, Central America, and the Caribbean. Each country includes map skills, physical geography, cities and people, source-grounded practice, a graded essay, Quiz Bowl retrieval rounds, and a unit assessment, followed by a cumulative final review.',
  subject: 'geography',
  grade: '6-12',
  difficulty: 'advanced',
  textbook: 'Covalent North America country geography notes',
  units: [...COUNTRY_UNITS, FINAL_EXAM_UNIT],
};
