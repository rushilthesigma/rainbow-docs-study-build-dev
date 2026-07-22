// PAUSD-style elective: "Oceania History". The country histories are drawn
// from the shared country-history note library so the curriculum stays in
// sync with the History presets used elsewhere in Covalent AI.
import { COUNTRY_HISTORY_NOTES } from './countryHistoryNotes/index.js';

const OCEANIA_NOTES = COUNTRY_HISTORY_NOTES.filter((note) => note.region === 'Oceania');

const SUBREGIONS = [
  'Australia & New Zealand',
  'Melanesia',
  'Micronesia',
  'Polynesia',
];

function countryUnit(note) {
  return {
    title: note.country,
    description: note.summary,
    textbookContext: note.mainNotes,
    lessons: [
      {
        title: `${note.country} - Foundations & Early Societies`,
        description: `Trace the earliest peoples, local societies, belief systems, and political communities of ${note.country}, using the course notes as the historical anchor.`,
      },
      {
        title: `${note.country} - States, Trade & Outside Powers`,
        description: `Follow the states, trade networks, migrations, missions, and outside powers that reshaped ${note.country} before the modern national period.`,
      },
      {
        title: `${note.country} - Colonialism, Independence & the Modern State`,
        description: `Connect colonial rule, resistance, independence, political change, and the contemporary challenges that define ${note.country}.`,
      },
    ],
  };
}

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive Oceania History',
  description: 'Cumulative review across Australia, New Zealand, Melanesia, Micronesia, and Polynesia: Indigenous societies, voyaging, colonial systems, decolonization, nation-building, and contemporary Pacific challenges.',
  textbookContext: SUBREGIONS.map((subregion) => {
    const notes = OCEANIA_NOTES.filter((note) => note.subregion === subregion);
    return `${subregion.toUpperCase()}\n${notes.map((note) => `- ${note.country}: ${note.summary}`).join('\n')}`;
  }).join('\n\n'),
  lessons: [
    {
      title: 'Oceania Review - Indigenous Worlds, Voyaging & Exchange',
      description: 'Compare Lapita and later Oceanic settlement, Indigenous political systems, long-distance voyaging, customary authority, trade, migration, and the distinct histories of continental, high-island, and atoll societies.',
    },
    {
      title: 'Oceania Review - Colonialism, Decolonization & the Pacific Present',
      description: 'Synthesize European and Asian imperial encounters, plantation and labor systems, World War II, independence movements, constitutional choices, regional diplomacy, nuclear legacies, and climate change.',
    },
  ],
};

export const OCEANIA_HISTORY_COURSE = {
  slug: 'oceania-history',
  title: 'Oceania History',
  description: 'A country-by-country history of Oceania, from Indigenous societies and Pacific voyaging through colonial rule, decolonization, nation-building, and the region\'s contemporary challenges. The course covers all 14 sovereign states across Australasia, Melanesia, Micronesia, and Polynesia.',
  subject: 'history',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'Covalent AI Oceania history notes',
  units: [
    ...OCEANIA_NOTES.map(countryUnit),
    FINAL_EXAM_UNIT,
  ],
};
