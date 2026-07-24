import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCountryPresetStockAnswers,
  isCountryTopicAnswer,
  validateCountryPresetTossup,
  validateCountryPresetQuestions,
} from './countrySetQuality.js';

test('rejects the country itself and decorated official-name answer lines', () => {
  assert.equal(isCountryTopicAnswer('France', 'France'), true);
  assert.equal(isCountryTopicAnswer('Republic of France', 'France'), true);
  assert.equal(isCountryTopicAnswer('French Republic', 'France'), true);
  assert.equal(isCountryTopicAnswer("People's Republic of China", 'China'), true);
  assert.equal(isCountryTopicAnswer('United States of America', 'United States'), true);
  assert.equal(isCountryTopicAnswer('French Revolution', 'France'), false);
  assert.equal(isCountryTopicAnswer('State of Mexico', 'Mexico'), false);
});

test('extracts only the stock quick-fact answer lines', () => {
  const source = `## Rivers & Water\nThe Seine crosses Paris.\n\n## Quick Facts\n- Capital: Paris\n- Area: about 551,700 square kilometers\n- Highest point: Mont Blanc, about 4,810 m\n- Longest river: Loire, about 1,000 km`;
  assert.deepEqual(extractCountryPresetStockAnswers(source), ['Paris', 'Mont Blanc', 'Loire']);
});

function question(index, overrides = {}) {
  const types = ['landform', 'waterway', 'city', 'region', 'island', 'climate-or-process', 'natural-hazard', 'human-geography', 'landmark', 'other-specific-entity'];
  const sections = ['Physical Features', 'Rivers & Water', 'Cities & People', 'Location & Borders'];
  return {
    text: `Early archival records connect this subject to a distinctive regional development with unusual historical circumstances. A separate geological or political relationship links it to a neighboring area through a documented process. Researchers distinguish it through a named feature, event, or institution that changed local conditions. Later accounts describe a concrete consequence that made the subject recognizable across the region. (*) A more familiar association places it near an important city, river, or cultural landmark. For 10 points, name this specific related entity from the country notes.`,
    answer: `Entity ${index}`,
    answerType: types[index % types.length],
    coverageTag: `angle-${index}`,
    sourceSection: sections[index % sections.length],
    ...overrides,
  };
}

test('requires varied, non-country answer slates before a set can be cached', () => {
  const source = '## Location & Borders\nContext.\n## Physical Features\nContext.\n## Rivers & Water\nContext.\n## Cities & People\nContext.\n## Quick Facts\n- Capital: Entity 1\n- Highest point: Entity 2\n- Longest river: Entity 3';
  const valid = Array.from({ length: 10 }, (_, index) => question(index));
  assert.equal(validateCountryPresetQuestions(valid, { country: 'France', category: 'Geography', source }).valid, true);

  const invalid = valid.map(item => ({ ...item }));
  invalid[0].answer = 'France';
  invalid[1].answer = invalid[2].answer;
  invalid[4].coverageTag = invalid[3].coverageTag;
  invalid[5].accept = ['French Republic'];
  const stockHeavySource = `${source}\n- Major river: Entity 4`;
  const result = validateCountryPresetQuestions(invalid, { country: 'France', category: 'Geography', source: stockHeavySource });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('question-1-country-as-answer'));
  assert.ok(result.reasons.includes('question-3-duplicate-answer'));
  assert.ok(result.reasons.includes('question-5-duplicate-coverage-tag'));
  assert.ok(result.reasons.includes('question-6-country-as-accepted-alias'));
  assert.ok(result.reasons.includes('too-many-quick-fact-answers'));
});

test('rejects answer leaks, filler layers, and power marks outside the pyramid', () => {
  const valid = question(0);
  assert.deepEqual(validateCountryPresetTossup(valid), []);

  assert.ok(validateCountryPresetTossup({
    ...valid,
    text: valid.text.replace('this specific related entity', 'Entity 0, this specific related entity'),
  }).includes('answer-leaked-in-clue'));

  assert.ok(validateCountryPresetTossup({
    ...valid,
    text: valid.text.replace('(*) ', '').replace('A separate', '(*) A separate'),
  }).includes('misplaced-power-mark'));

  const filler = 'This thing is important for the country and its people. This thing is important for the country and its people. This thing is important for the country and its people. This thing is important for the country and its people. (*) This thing is important for the country and its people. For 10 points, name this thing from the country notes.';
  const fillerReasons = validateCountryPresetTossup({ text: filler, answer: 'Distinctive Place' });
  assert.ok(fillerReasons.includes('too-little-specific-clue-content'));
  assert.ok(fillerReasons.includes('repeated-clue-layer'));
});
