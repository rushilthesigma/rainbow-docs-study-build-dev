import checkAnswer from 'qb-answer-checker';

// QBReader publishes this exact checker as `qb-answer-checker`. Keep a tiny
// local adapter so every client-side Quiz Bowl surface uses the same API and
// callers can distinguish an accepted answer from a "prompt" response.
export function judgeQuizBowlAnswer(answerline, givenAnswer, strictness = 7) {
  return checkAnswer(String(answerline || ''), String(givenAnswer || ''), strictness);
}

export function isQuizBowlAnswerAccepted(answerline, givenAnswer, strictness = 7) {
  return judgeQuizBowlAnswer(answerline, givenAnswer, strictness).directive === 'accept';
}

// AI-written tossups carry explicit literal aliases instead of a raw QBReader
// answerline. Turn those literals into escaped, anchored regexes locally: this
// gives us punctuation/article/case tolerance without executing model-authored
// regex (and without opening the door to invalid or catastrophic patterns).
function normalizedAnswer(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Generated answer guides are intentionally literal, but ordinary players do
// not always use the same grammatical form as the guide.  Keep the strict
// literal check first, then allow a narrow semantic-normalization pass for
// equivalent constructions such as "Chinese provinces" and "provinces of
// China".  This is deliberately token based rather than fuzzy/edit-distance
// based so a merely similar proper noun is never accepted.
const DEMONYM_TO_COUNTRY = new Map(Object.entries({
  american: 'united states', british: 'united kingdom', chinese: 'china',
  dutch: 'netherlands', english: 'england', french: 'france', german: 'germany',
  greek: 'greece', indian: 'india', indonesian: 'indonesia', iranian: 'iran',
  iraqi: 'iraq', irish: 'ireland', italian: 'italy', japanese: 'japan',
  korean: 'korea', mexican: 'mexico', pakistani: 'pakistan', polish: 'poland',
  portuguese: 'portugal', russian: 'russia', spanish: 'spain',
  swiss: 'switzerland', turkish: 'turkey', ukrainian: 'ukraine',
  vietnamese: 'vietnam',
}));

function semanticTokens(value) {
  const raw = normalizedAnswer(value)
    .replace(/\b(?:a|an|the|of|in|from|for|to)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const usedDemonym = raw.some((token) => DEMONYM_TO_COUNTRY.has(token));
  const expanded = raw.flatMap((token) => (DEMONYM_TO_COUNTRY.get(token) || token).split(' '));
  const tokens = expanded.map((token) => {
    // Only normalize uncomplicated plurals. Proper names ending in ss/us/is
    // retain their spelling, while province/provinces and dynasty/dynasties
    // compare as the same concept.
    if (/ies$/.test(token) && token.length > 4) return `${token.slice(0, -3)}y`;
    if (/s$/.test(token) && !/(?:ss|us|is)$/.test(token) && token.length > 3) return token.slice(0, -1);
    return token;
  });
  return { tokens, usedDemonym };
}

function semanticallyEquivalentLiteral(givenAnswer, variants) {
  const given = semanticTokens(givenAnswer);
  if (!given.tokens.length) return false;
  return variants.some((variant) => {
    const expected = semanticTokens(variant);
    if (expected.tokens.length !== given.tokens.length) return false;
    if (expected.tokens.every((token, index) => token === given.tokens[index])) return true;
    if (!expected.usedDemonym && !given.usedDemonym) return false;
    return [...expected.tokens].sort().every((token, index) => token === [...given.tokens].sort()[index]);
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function literalAnswerRegex(value) {
  const normalized = normalizedAnswer(value).replace(/^(?:a|an|the)\s+/, '');
  if (!normalized) return null;
  const body = normalized.split(/\s+/).map(escapeRegex).join('\\s+');
  return new RegExp(`^(?:(?:a|an|the)\\s+)?${body}$`, 'i');
}

function matchesLiteralVariant(givenAnswer, variants) {
  const given = normalizedAnswer(givenAnswer);
  if (!given) return false;
  return variants.some((variant) => literalAnswerRegex(variant)?.test(given));
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 20);
}

function promptEntries(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return { answer: entry.trim(), message: '' };
    return {
      answer: String(entry?.answer || entry?.match || '').trim(),
      message: String(entry?.message || entry?.prompt || '').trim().slice(0, 160),
    };
  }).filter((entry) => entry.answer).slice(0, 20);
}

// Judge a complete question object. QBReader material keeps using its native
// answerline engine. AI material uses the generated acceptance guide whenever
// one is present, with exact regex matching for canonical answers + aliases and
// a real third-state prompt for deliberately incomplete answers.
export function judgeQuizBowlQuestion(question, givenAnswer, strictness = 7) {
  const q = question || {};
  if (q.answerline) return judgeQuizBowlAnswer(q.answerline, givenAnswer, strictness);

  const accepts = stringList(q.accept || q.acceptedAnswers);
  const prompts = promptEntries(q.prompt || q.promptAnswers);
  // Presence, not length, opts into strict guided judging. Empty arrays mean
  // "canonical answer only"; older saved AI questions with neither field keep
  // the legacy fuzzy checker for backward compatibility.
  const hasGuide = Array.isArray(q.accept) || Array.isArray(q.acceptedAnswers)
    || Array.isArray(q.prompt) || Array.isArray(q.promptAnswers);
  if (!hasGuide) return judgeQuizBowlAnswer(q.answer || '', givenAnswer, strictness);

  const acceptedVariants = [q.answer, ...accepts];
  if (matchesLiteralVariant(givenAnswer, acceptedVariants)
    || semanticallyEquivalentLiteral(givenAnswer, acceptedVariants)) return { directive: 'accept' };
  const promptMatch = prompts.find((entry) => matchesLiteralVariant(givenAnswer, [entry.answer]));
  if (promptMatch) {
    return {
      directive: 'prompt',
      directedPrompt: promptMatch.message || 'Be more specific.',
    };
  }
  return { directive: 'reject' };
}

export function isQuizBowlQuestionAccepted(question, givenAnswer, strictness = 7) {
  return judgeQuizBowlQuestion(question, givenAnswer, strictness).directive === 'accept';
}
