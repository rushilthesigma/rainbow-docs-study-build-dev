export const COUNTRY_SET_GENERATION_VERSION = 2;

export const COUNTRY_SET_ANSWER_TYPES = {
  Geography: [
    'landform',
    'waterway',
    'city',
    'region',
    'island',
    'climate-or-process',
    'natural-hazard',
    'human-geography',
    'landmark',
    'other-specific-entity',
  ],
  History: [
    'person',
    'event',
    'movement-or-group',
    'institution',
    'law-or-treaty',
    'place',
    'polity-or-dynasty',
    'work-or-idea',
    'other-specific-entity',
  ],
};

const OFFICIAL_COUNTRY_ALIASES = {
  'Bolivia': ['Plurinational State of Bolivia'],
  'Brunei': ['Brunei Darussalam'],
  'Cabo Verde': ['Cape Verde'],
  'China': ["People's Republic of China", 'PRC'],
  'Czechia': ['Czech Republic'],
  'Eswatini': ['Swaziland'],
  'France': ['French Republic'],
  'Iran': ['Islamic Republic of Iran'],
  'Ivory Coast': ["Cote d'Ivoire"],
  'Laos': ["Lao People's Democratic Republic"],
  'Moldova': ['Republic of Moldova'],
  'Myanmar': ['Burma'],
  'North Korea': ["Democratic People's Republic of Korea", 'DPRK'],
  'Russia': ['Russian Federation'],
  'South Korea': ['Republic of Korea', 'ROK', 'Korea'],
  'Syria': ['Syrian Arab Republic'],
  'Taiwan': ['Republic of China', 'ROC'],
  'Tanzania': ['United Republic of Tanzania'],
  'Timor-Leste': ['East Timor'],
  'Turkey': ['Turkiye'],
  'United Kingdom': [
    'United Kingdom of Great Britain and Northern Ireland',
    'Great Britain',
    'Britain',
    'UK',
  ],
  'United States': ['United States of America', 'America', 'USA', 'US'],
  'Venezuela': ['Bolivarian Republic of Venezuela'],
  'Vatican City': ['Holy See'],
  'Vietnam': ['Socialist Republic of Vietnam'],
};

const STATE_DESCRIPTORS = new Set([
  'a', 'an', 'and', 'arab', 'commonwealth', 'constitutional', 'country',
  'democratic', 'duchy', 'federal', 'federated', 'grand', 'islamic', 'kingdom',
  'nation', 'of', 'people', 'peoples', 'plurinational', 'principality', 'republic',
  'socialist', 'sovereign', 'state', 'states', 'territory', 'the', 'united',
]);

function normalize(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the\s+/, '');
}

function meaningfulStateTokens(value) {
  return normalize(value).split(/\s+/).filter(token => token && !STATE_DESCRIPTORS.has(token));
}

export function isCountryTopicAnswer(answer, country) {
  const answerKey = normalize(answer);
  const countryKey = normalize(country);
  if (!answerKey || !countryKey) return false;

  // A first-level subdivision can legitimately be named "State of Mexico".
  // Preserve that entity even though "Mexico (state)" remains a decorated
  // country label and is rejected below.
  if (answerKey === `state of ${countryKey}`) return false;

  const aliases = [country, ...(OFFICIAL_COUNTRY_ALIASES[country] || [])].map(normalize);
  if (aliases.includes(answerKey)) return true;

  // Catch decorated forms such as "Republic of France", "Japan (country)",
  // or "the sovereign state of Mexico" without rejecting related entities
  // such as the French Revolution or the State of Mexico.
  const answerTokens = answerKey.split(' ');
  const countryTokens = countryKey.split(' ');
  for (let index = 0; index <= answerTokens.length - countryTokens.length; index++) {
    const matches = countryTokens.every((token, offset) => answerTokens[index + offset] === token);
    if (!matches) continue;
    const remainder = answerTokens.filter((_, tokenIndex) => (
      tokenIndex < index || tokenIndex >= index + countryTokens.length
    ));
    if (remainder.every(token => STATE_DESCRIPTORS.has(token))) return true;
  }

  const answerMeaningful = meaningfulStateTokens(answer);
  const countryMeaningful = meaningfulStateTokens(country);
  return answerMeaningful.length > 0
    && answerMeaningful.length === countryMeaningful.length
    && answerMeaningful.every((token, index) => token === countryMeaningful[index]);
}

function entityKey(value) {
  const genericEntityWords = new Set(['lake', 'mount', 'mountain', 'peak', 'river', 'the']);
  return normalize(value).split(' ').filter(token => !genericEntityWords.has(token)).join(' ');
}

export function extractCountryPresetStockAnswers(source = '') {
  const quickFacts = String(source).split(/##\s+Quick Facts/i)[1]?.split(/\n##\s+/)[0] || '';
  const answers = [];
  for (const line of quickFacts.split('\n')) {
    const match = line.match(/^\s*-\s*(Capital|Highest point|Longest river|Major river)\s*:\s*(.+)$/i);
    if (!match) continue;
    const value = match[2]
      .replace(/^about\s+/i, '')
      .split(/,|\(|\babout\b/i)[0]
      .trim();
    if (value) answers.push(value);
  }
  return answers;
}

function questionText(question) {
  return String(question?.text || '').trim();
}

export function validateCountryPresetQuestions(questions, {
  country = '',
  category = 'Geography',
  source = '',
  count = 10,
} = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const reasons = [];
  const answerKeys = new Set();
  const coverageKeys = new Set();
  const sourceSections = new Set();
  const typeCounts = new Map();
  const allowedTypes = new Set(COUNTRY_SET_ANSWER_TYPES[category] || []);
  const allowedSourceSections = new Set(
    [...String(source).matchAll(/^##\s+(.+)$/gm)].map(match => normalize(match[1])).filter(Boolean),
  );
  const stockKeys = new Set(extractCountryPresetStockAnswers(source).map(entityKey).filter(Boolean));
  let stockCount = 0;

  if (list.length !== count) reasons.push(`expected-${count}-questions`);

  for (let index = 0; index < list.length; index++) {
    const question = list[index] || {};
    const position = index + 1;
    const text = questionText(question);
    const answer = String(question.answer || '').trim();
    const answerKey = normalize(answer);
    const coverageKey = normalize(question.coverageTag);
    const sourceSection = String(question.sourceSection || '').trim();
    const answerType = String(question.answerType || '').trim();

    if (!text || !answer) reasons.push(`question-${position}-missing-text-or-answer`);
    if (isCountryTopicAnswer(answer, country)) reasons.push(`question-${position}-country-as-answer`);
    if ((Array.isArray(question.accept) ? question.accept : []).some(alias => isCountryTopicAnswer(alias, country))) {
      reasons.push(`question-${position}-country-as-accepted-alias`);
    }
    if (answerKey && answerKeys.has(answerKey)) reasons.push(`question-${position}-duplicate-answer`);
    if (answerKey) answerKeys.add(answerKey);

    if (!coverageKey) reasons.push(`question-${position}-missing-coverage-tag`);
    else if (coverageKeys.has(coverageKey)) reasons.push(`question-${position}-duplicate-coverage-tag`);
    else coverageKeys.add(coverageKey);

    if (!sourceSection) reasons.push(`question-${position}-missing-source-section`);
    else if (!allowedSourceSections.has(normalize(sourceSection))) reasons.push(`question-${position}-unknown-source-section`);
    else sourceSections.add(normalize(sourceSection));

    if (!allowedTypes.has(answerType)) reasons.push(`question-${position}-invalid-answer-type`);
    else typeCounts.set(answerType, (typeCounts.get(answerType) || 0) + 1);

    if (stockKeys.has(entityKey(answer))) stockCount++;

    const powerMarks = text.match(/\(\s*\*\s*\)/g) || [];
    if (powerMarks.length !== 1) reasons.push(`question-${position}-invalid-power-mark`);
    const sentences = text.replace(/\(\s*\*\s*\)/g, '').split(/[.!?]+/).filter(part => part.trim());
    if (sentences.length < 6) reasons.push(`question-${position}-too-few-clue-layers`);
    if (text.split(/\s+/).filter(Boolean).length < 70) reasons.push(`question-${position}-too-short`);
  }

  if (typeCounts.size < 4) reasons.push('not-enough-answer-types');
  if ([...typeCounts.values()].some(typeCount => typeCount > 4)) reasons.push('one-answer-type-dominates');
  if (sourceSections.size < 4) reasons.push('not-enough-source-sections');
  if (category === 'Geography' && stockCount > 3) reasons.push('too-many-quick-fact-answers');

  return { valid: reasons.length === 0, reasons, stockCount };
}
