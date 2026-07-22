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

  if (matchesLiteralVariant(givenAnswer, [q.answer, ...accepts])) return { directive: 'accept' };
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
