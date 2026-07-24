export const COUNTRY_SET_GENERATION_VERSION = 3;

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

// These words describe the question format rather than a useful clue. They
// are intentionally a small list: the validator should catch filler, not
// require one particular writing voice or vocabulary.
const CLUE_FORMAT_WORDS = new Set([
  'about', 'answer', 'clue', 'country', 'described', 'entity', 'fact', 'final',
  'first', 'following', 'given', 'identify', 'important', 'name', 'number',
  'people', 'points', 'question', 'second', 'sentence', 'specific', 'subject',
  'thing', 'third', 'this', 'which', 'with',
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

function clueSentences(text) {
  return String(text || '')
    .replace(/\(\s*\*\s*\)/g, '')
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function clueTokens(sentence) {
  return new Set(normalize(sentence).split(/\s+/).filter(token => (
    token.length >= 4 && !CLUE_FORMAT_WORDS.has(token)
  )));
}

function cluesAreNearDuplicates(first, second) {
  const a = clueTokens(first);
  const b = clueTokens(second);
  const firstKey = normalize(first);
  const secondKey = normalize(second);
  if (firstKey.length >= 30 && firstKey === secondKey) return true;
  if (a.size < 4 || b.size < 4) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared >= 4 && shared / Math.min(a.size, b.size) >= 0.75;
}

function questionLeaksAnswer(text, answer) {
  const answerKey = normalize(answer);
  const questionKey = normalize(String(text || '').replace(/\(\s*\*\s*\)/g, ' '));
  // Very short answer lines (for example, abbreviations) are too ambiguous
  // for a substring rule; other validations still cover their structure.
  return answerKey.length >= 4 && (` ${questionKey} `).includes(` ${answerKey} `);
}

// This is deliberately structural. It blocks the common low-quality drafts
// without trying to decide whether a historically accurate clue is "hard"
// enough, which would make legitimate questions fail unpredictably.
export function validateCountryPresetTossup(question) {
  const text = questionText(question);
  const answer = String(question?.answer || '').trim();
  const reasons = [];
  const powerMarks = text.match(/\(\s*\*\s*\)/g) || [];
  const sentences = clueSentences(text);

  if (!text || !answer) reasons.push('missing-text-or-answer');
  if (text.split(/\s+/).filter(Boolean).length < 70) reasons.push('too-short');
  if (sentences.length < 6) reasons.push('too-few-clue-layers');
  if (questionLeaksAnswer(text, answer)) reasons.push('answer-leaked-in-clue');

  if (powerMarks.length !== 1) {
    reasons.push('invalid-power-mark');
  } else {
    const markIndex = text.indexOf(powerMarks[0]);
    const before = text.slice(0, markIndex).trim();
    const after = text.slice(markIndex + powerMarks[0].length).trim();
    const beforeWords = before.split(/\s+/).filter(Boolean).length;
    const totalWords = text.replace(/\(\s*\*\s*\)/g, ' ').split(/\s+/).filter(Boolean).length;
    const position = beforeWords / Math.max(1, totalWords);
    const beforeSentences = clueSentences(before).length;
    const afterSentences = clueSentences(after).length;

    if (!/[.!?]$/.test(before) || position < 0.5 || position > 0.82 || beforeSentences < 4 || afterSentences < 2) {
      reasons.push('misplaced-power-mark');
    }
  }

  // A real pyramid needs several independently useful layers. Five leaves
  // room for a concise final giveaway but rejects six generic filler lines.
  if (sentences.filter(sentence => clueTokens(sentence).size >= 3).length < 5) {
    reasons.push('too-little-specific-clue-content');
  }
  if (sentences.some((sentence, index) => sentences.slice(index + 1)
    .some(other => cluesAreNearDuplicates(sentence, other)))) {
    reasons.push('repeated-clue-layer');
  }

  return reasons;
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

    for (const reason of validateCountryPresetTossup(question)) {
      reasons.push(`question-${position}-${reason}`);
    }
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

  }

  if (typeCounts.size < 4) reasons.push('not-enough-answer-types');
  if ([...typeCounts.values()].some(typeCount => typeCount > 4)) reasons.push('one-answer-type-dominates');
  if (sourceSections.size < 4) reasons.push('not-enough-source-sections');
  if (category === 'Geography' && stockCount > 3) reasons.push('too-many-quick-fact-answers');

  return { valid: reasons.length === 0, reasons, stockCount };
}
