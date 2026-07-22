// History presets for every first-level subdivision in the Notes catalog. The
// geography presets already contain a generated "History & culture" section,
// so these notes reuse that authored material and add carefully scoped national
// context from the country-history presets.
import { SUBDIVISION_GEO_NOTES } from '../countryGeoNotes/subdivisions.js';
import { GENERATED_COUNTRY_HISTORY_NOTES } from './countryHistoryNotesGenerated.js';

const HISTORY_CUE_TERMS = [
  'history', 'histor', 'colon', 'indigenous', 'empire', 'kingdom', 'war',
  'revolution', 'independence', 'formed', 'founded', 'ancient', 'culture',
  'settled', 'conquest', 'migration', 'dynasty', 'treaty', 'civilization',
];

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractHistorySection(mainNotes = '') {
  const match = mainNotes.match(/## History & culture\s+([\s\S]*?)(?=\n## |$)/i);
  return match?.[1]?.trim() || mainNotes.trim();
}

function extractQuickFacts(mainNotes = '') {
  const match = mainNotes.match(/## Quick facts\s+([\s\S]*?)(?=\n## |$)/i);
  return match?.[1]?.trim() || '';
}

function extractSection(mainNotes = '', heading = '') {
  if (!mainNotes || !heading) return '';
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = mainNotes.match(new RegExp(`## ${escapedHeading}\\s+([\\s\\S]*?)(?=\\n## |$)`, 'i'));
  return match?.[1]?.trim() || '';
}

function makeCues(preset) {
  const historicalCues = (preset.cues || []).filter(cue =>
    HISTORY_CUE_TERMS.some(term => cue.toLowerCase().includes(term))
  );
  const fallbackCues = [
    `Which early peoples, states, or cultures shaped the history of ${preset.subdivision}?`,
    `Which outside powers or colonial systems influenced ${preset.subdivision}?`,
    `How did ${preset.subdivision} become part of modern ${preset.country}?`,
    `Which conflict, political movement, or economic change shaped ${preset.subdivision}?`,
    `What cultural traditions connect ${preset.subdivision} to its earlier history?`,
    `What historical turning point is especially associated with ${preset.subdivision}?`,
  ];
  return [...new Set([...historicalCues, ...fallbackCues])]
    .slice(0, 7)
    .map(cue => cue.trim())
    .filter(Boolean);
}

function makeHistoryPreset(preset) {
  const history = extractHistorySection(preset.mainNotes);
  const quickFacts = extractQuickFacts(preset.mainNotes);
  const countryHistory = GENERATED_COUNTRY_HISTORY_NOTES[`history-${slugify(preset.country)}`];
  const stateFormation = extractSection(countryHistory?.mainNotes, 'Formation of the modern state');
  const twentiethCentury = extractSection(countryHistory?.mainNotes, 'Twentieth century');
  const slug = `history-subdivision-${slugify(preset.country)}-${slugify(preset.subdivision)}`;
  const scopeLine = `${preset.subdivision} is a first-level ${preset.subdivisionType.toLowerCase()} of ${preset.country}. The historical note should be read with the country-level history preset so local events are connected to wider state formation, migration, conflict, and political economy.`;
  const nationalContext = [
    '## National context',
    `Local developments in ${preset.subdivision} unfolded within the wider formation of modern ${preset.country}. These two short sections provide the national timeline needed to place the subdivision's own historical landmarks in sequence.`,
    stateFormation ? `### Formation of the modern state\n\n${stateFormation}` : '',
    twentiethCentury ? `### Twentieth-century setting\n\n${twentiethCentury}` : '',
  ].filter(Boolean).join('\n\n');
  return {
    slug,
    category: 'history-subdivision',
    country: preset.country,
    region: preset.region,
    subregion: preset.subdivisionType,
    subdivision: preset.subdivision,
    subdivisionType: preset.subdivisionType,
    title: `History of ${preset.subdivision}, ${preset.country}`,
    cues: makeCues(preset),
    mainNotes: [
      `## Historical overview\n\n${history}`,
      nationalContext,
      `## Administrative context\n\n${scopeLine}`,
      quickFacts ? `## Historical anchors\n\n${quickFacts}` : '',
      `## Study frame\n\nUse the subdivision's administrative center, neighboring regions, physical setting, and country-level history to place local developments in sequence. Ask which earlier peoples and political systems shaped the area, how outside powers or internal reforms changed its administration, and which twentieth- or twenty-first-century events still shape its identity.`,
    ].filter(Boolean).join('\n\n'),
    summary: `The history of ${preset.subdivision} is part of the longer history of ${preset.country}. ${preset.summary} The note also connects its historical overview to administrative identity and map-based study questions.`,
  };
}

export const COUNTRY_HISTORY_SUBDIVISION_NOTES = SUBDIVISION_GEO_NOTES.map(makeHistoryPreset);

export const COUNTRY_HISTORY_SUBDIVISION_NOTES_BY_SLUG = Object.fromEntries(
  COUNTRY_HISTORY_SUBDIVISION_NOTES.map(note => [note.slug, note])
);
