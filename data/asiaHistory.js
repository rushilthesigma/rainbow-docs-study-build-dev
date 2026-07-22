// PAUSD-style elective: "Asia History". Each country unit is grounded in
// the shared country-history note library and ends with a continent-wide exam.
import { COUNTRY_HISTORY_NOTES } from './countryHistoryNotes/index.js';

const ASIA_NOTES = COUNTRY_HISTORY_NOTES.filter((note) => note.region === 'Asia');

const SUBREGIONS = [
  'Central Asia',
  'Western Asia',
  'South Asia',
  'Southeast Asia',
  'East Asia',
];

function countryUnit(note) {
  return {
    title: note.country,
    description: note.summary,
    textbookContext: note.mainNotes,
    lessons: [
      {
        title: `${note.country} - Foundations & Early Societies`,
        description: `Trace the earliest peoples, states, belief systems, and cultural foundations of ${note.country}, using the course notes as the historical anchor.`,
      },
      {
        title: `${note.country} - States, Empires & Outside Powers`,
        description: `Follow the empires, trade routes, migrations, religious movements, and outside powers that shaped ${note.country} before the modern national period.`,
      },
      {
        title: `${note.country} - Colonialism, Independence & the Modern State`,
        description: `Connect imperial rule, resistance, independence, revolution, political change, and the contemporary challenges that define ${note.country}.`,
      },
    ],
  };
}

const FINAL_EXAM_UNIT = {
  title: 'Final Exam - Comprehensive Asian History',
  description: 'Cumulative review across Central Asia, Western Asia, South Asia, Southeast Asia, and East Asia: early civilizations, empire, religion, trade, colonialism, nationalism, revolution, war, and modern state formation.',
  textbookContext: SUBREGIONS.map((subregion) => {
    const notes = ASIA_NOTES.filter((note) => note.subregion === subregion);
    return `${subregion.toUpperCase()}\n${notes.map((note) => `- ${note.country}: ${note.summary}`).join('\n')}`;
  }).join('\n\n'),
  lessons: [
    {
      title: 'Asia Review - Civilizations, Religions & Exchange Networks',
      description: 'Compare the civilizations, belief systems, migrations, and commercial networks that connected the Silk Roads, Indian Ocean, steppe corridors, monsoon seas, and East Asian worlds.',
    },
    {
      title: 'Asia Review - Empire, Colonialism, War & State Formation',
      description: 'Synthesize imperial expansion, European and Japanese colonialism, anticolonial movements, world wars, revolutions, partition, Cold War alignments, and the making of contemporary Asian states.',
    },
  ],
};

export const ASIA_HISTORY_COURSE = {
  slug: 'asia-history',
  title: 'Asia History',
  description: 'A country-by-country history of Asia, from early civilizations, empires, religions, and exchange networks through colonialism, independence, revolution, war, and modern nation-building. The course covers 49 countries across Central, Western, South, Southeast, and East Asia.',
  subject: 'history',
  grade: '9-12',
  difficulty: 'advanced',
  textbook: 'Covalent AI Asia history notes',
  units: [
    ...ASIA_NOTES.map(countryUnit),
    FINAL_EXAM_UNIT,
  ],
};
