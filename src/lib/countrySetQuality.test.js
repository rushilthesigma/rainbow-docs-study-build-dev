import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCountryPresetStockAnswers,
  isCountryTopicAnswer,
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
    text: `This is specialist clue sentence number one with enough precise identifying context for entity ${index}. This is a second independent clue from another part of the source material for entity ${index}. This third clue narrows the answer through a named relationship and distinct factual detail. This fourth clue supplies another source-supported fact without repeating the earlier wording. (*) This fifth clue is more accessible while still identifying the same answer. For 10 points, name this specific related entity described by the final giveaway clue.`,
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
