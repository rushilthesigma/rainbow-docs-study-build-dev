const MIXED_CATEGORIES = [
  'Science',
  'History',
  'Literature',
  'Geography',
  'Fine Arts',
  'Religion / Mythology / Philosophy',
  'Social Science',
  'Math',
  'Pop Culture',
];

const TEXT_STOPWORDS = new Set([
  'a', 'an', 'and', 'answer', 'are', 'as', 'at', 'be', 'before', 'by', 'called',
  'clue', 'for', 'from', 'giveaway', 'identify', 'in', 'is', 'it', 'name', 'of',
  'on', 'one', 'points', 'question', 'that', 'the', 'this', 'to', 'was', 'were',
  'what', 'which', 'who', 'with',
]);

function seedNumber(seed) {
  const text = String(seed ?? 'question-diversity');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle(items, seed) {
  const out = [...items];
  let state = seedNumber(seed) || 1;
  const random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function normalizeQuestionAnswer(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:accept|prompt on|do not accept|or)\b.*$/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answersOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aWords = a.split(' ');
  const bWords = b.split(' ');
  const shorter = aWords.length <= bWords.length ? aWords : bWords;
  const longer = aWords.length <= bWords.length ? bWords : aWords;
  // Treat a canonical surname/title repeated with a fuller name as the same
  // answer, while avoiding collisions on tiny words such as "art" or "war".
  if (shorter.length === 1 && shorter[0].length >= 5 && longer.includes(shorter[0])) return true;
  return shorter.length > 1 && shorter.every(word => longer.includes(word));
}

function questionText(question) {
  return String(question?.text || question?.question || '').trim();
}

function textTokens(raw) {
  return new Set(String(raw || '')
    .toLowerCase()
    .replace(/\(\s*\*\s*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !TEXT_STOPWORDS.has(word)));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function splitClueSentences(text) {
  return String(text || '')
    .replace(/\(\s*\*\s*\)/g, ' ')
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

// A clue counts as reused when a sentence shares most of its content tokens
// with a banned sentence. Overlap coefficient (vs jaccard) catches an old
// clue restated inside a longer new sentence; the shared-token floor keeps
// short same-topic sentences from colliding on common vocabulary.
function clueSentencesMatch(a, b) {
  if (a.size < 4 || b.size < 4) return false;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared >= 4 && shared / Math.min(a.size, b.size) >= 0.6;
}

// Every clue sentence the student was read in their most recent played
// sets (newest first, any source). Feeds both the generation prompt and
// the hard reused-clue rejection in filterDiverseQuestions.
export function collectBannedClues(sets, { setCap = 8, maxClues = 400 } = {}) {
  const clues = [];
  for (const set of (Array.isArray(sets) ? sets : []).slice(0, setCap)) {
    for (const pq of set?.perQuestion || []) {
      for (const sentence of splitClueSentences(pq?.text)) {
        const tokens = textTokens(sentence);
        if (tokens.size < 5) continue;
        clues.push({ sentence, tokens });
        if (clues.length >= maxClues) return clues;
      }
    }
  }
  return clues;
}

// Returns the banned sentence a question reuses, or null if it is clean.
export function findReusedClue(text, bannedClues = []) {
  if (!bannedClues.length) return null;
  for (const sentence of splitClueSentences(text)) {
    const tokens = textTokens(sentence);
    for (const banned of bannedClues) {
      if (clueSentencesMatch(tokens, banned.tokens)) return banned.sentence;
    }
  }
  return null;
}

export function buildClueBanInstructions({ clues = [], setCount = 8, maxChars = 12000 } = {}) {
  if (!clues.length) return '';
  const lines = [];
  let used = 0;
  for (const clue of clues) {
    const line = `- ${clue.sentence}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  return `BANNED CLUE MATERIAL (hard rule):
The student has already been read every clue below across their last ${setCount} sets. Reusing any of them - verbatim or reworded - makes the question invalid, even for a different answer line. Test different facts, works, episodes, mechanisms, and angles instead, including when writing about the same answer or topic.
${lines.join('\n')}`;
}

export function filterDiverseQuestions(questions, {
  count = Infinity,
  allowAnswerReuse = false,
  checkAnswerDiversity = true,
  textSimilarityThreshold = 0.68,
  validateQuestion = null,
  bannedClues = [],
} = {}) {
  const accepted = [];
  const rejected = [];
  const acceptedAnswers = [];
  const acceptedTokens = [];

  for (const question of Array.isArray(questions) ? questions : []) {
    if (accepted.length >= count) break;
    const text = questionText(question);
    const answerKey = normalizeQuestionAnswer(question?.answer);
    if (!text || (checkAnswerDiversity && !answerKey)) {
      rejected.push({ question, reason: 'missing-text-or-answer' });
      continue;
    }
    const validationReason = validateQuestion?.(question);
    if (validationReason) {
      rejected.push({ question, reason: validationReason });
      continue;
    }
    if (findReusedClue(text, bannedClues)) {
      rejected.push({ question, reason: 'reused-past-clue' });
      continue;
    }
    if (checkAnswerDiversity && !allowAnswerReuse && acceptedAnswers.some(existing => answersOverlap(existing, answerKey))) {
      rejected.push({ question, reason: 'duplicate-answer' });
      continue;
    }
    const tokens = textTokens(text);
    if (acceptedTokens.some(existing => jaccard(existing, tokens) >= textSimilarityThreshold)) {
      rejected.push({ question, reason: 'similar-clues' });
      continue;
    }
    accepted.push(question);
    if (answerKey) acceptedAnswers.push(answerKey);
    acceptedTokens.push(tokens);
  }

  return { accepted, rejected };
}

function questionContainsAnswer(text, answer) {
  const normalizedText = String(text || '')
    .toLowerCase()
    .replace(/\(\s*\*\s*\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedAnswer = normalizeQuestionAnswer(answer);
  return normalizedAnswer.length >= 4
    && (` ${normalizedText} `).includes(` ${normalizedAnswer} `);
}

// Pyramidal quality checks are deliberately mechanical. They do not try to
// judge whether a clue is "hard" (only a writer can do that), but they reject
// the common structural failures before a set reaches a player.
function pyramidProfile(difficulty) {
  const level = String(difficulty || '').toLowerCase();
  if (level === 'tournament' || level.includes('championship') || level.includes('national')) {
    return { minWords: 120, minSentences: 7, minBefore: 4, minAfter: 2, minPower: 0.45, maxPower: 0.82, label: 'tournament' };
  }
  if (level === 'hard' || level === 'college') {
    return { minWords: 100, minSentences: 6, minBefore: 4, minAfter: 2, minPower: 0.45, maxPower: 0.82, label: 'hard' };
  }
  if (level === 'easy' || level.includes('middle') || level.includes('elementary')) {
    return { minWords: 70, minSentences: 6, minBefore: 4, minAfter: 2, minPower: 0.45, maxPower: 0.82, label: 'easy' };
  }
  return { minWords: 85, minSentences: 6, minBefore: 4, minAfter: 2, minPower: 0.45, maxPower: 0.82, label: 'standard' };
}

export function validatePyramidalTossup(question, { topic = '', requirePowerMark = true, difficulty = '' } = {}) {
  const text = questionText(question);
  const answer = question?.answer || '';
  const words = text.replace(/\(\s*\*\s*\)/g, ' ').trim().split(/\s+/).filter(Boolean);
  const powerMarks = text.match(/\(\s*\*\s*\)/g) || [];
  const topicKey = normalizeQuestionAnswer(topic);
  const answerKey = normalizeQuestionAnswer(answer);
  const profile = pyramidProfile(difficulty);

  if (topicKey && answersOverlap(topicKey, answerKey)) return 'topic-as-answer';
  if (questionContainsAnswer(text, answer)) return 'answer-leaked-in-clue';
  if (words.length < profile.minWords) return profile.label === 'tournament' ? 'too-short-for-tournament' : 'too-short-for-pyramidal';
  const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim());
  if (sentences.length < profile.minSentences) return profile.label === 'tournament' ? 'not-enough-tournament-clue-layers' : 'not-enough-clue-layers';
  if (requirePowerMark && powerMarks.length !== 1) return 'invalid-power-mark';
  if (powerMarks.length === 1) {
    const before = text.slice(0, text.indexOf(powerMarks[0])).trim().split(/\s+/).filter(Boolean).length;
    const position = before / Math.max(1, words.length);
    if (position < profile.minPower || position > profile.maxPower) return 'misplaced-power-mark';
    const beforeSentences = text.slice(0, text.indexOf(powerMarks[0])).split(/[.!?]+/).filter(s => s.trim()).length;
    const afterSentences = text.slice(text.indexOf(powerMarks[0]) + powerMarks[0].length).split(/[.!?]+/).filter(s => s.trim()).length;
    if (beforeSentences < profile.minBefore || afterSentences < profile.minAfter) {
      return profile.label === 'tournament' ? 'not-enough-tournament-clue-layers' : 'not-enough-clue-layers';
    }
  }
  return null;
}

function ensureSentencePunctuation(sentence) {
  const clean = String(sentence || '').replace(/\(\s*\*\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

// Generation uses an explicit clue array so sentence count and the scoring
// boundary are data, not formatting guesses. Older providers may still return
// a paragraph; when it already contains enough sentences, normalize it through
// the same path. This does not invent or relax clues—it only assembles the
// authored sentences and places the power mark at a legal sentence boundary.
export function normalizeGeneratedTossup(question, { difficulty = '' } = {}) {
  const rawText = questionText(question);
  const providedClues = Array.isArray(question?.clues) ? question.clues : [];
  const paragraphClues = rawText
    .replace(/\(\s*\*\s*\)/g, ' ')
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const clues = (providedClues.length ? providedClues : paragraphClues)
    .map(ensureSentencePunctuation)
    .filter(Boolean);
  const profile = pyramidProfile(difficulty);

  if (clues.length < profile.minSentences) {
    return { ...question, text: rawText, answer: String(question?.answer || question?.answerline || '').trim() };
  }

  const clueWords = clues.map(clue => clue.split(/\s+/).filter(Boolean).length);
  const totalWords = clueWords.reduce((sum, words) => sum + words, 0);
  const candidates = [];
  for (let boundary = profile.minBefore; boundary <= clues.length - profile.minAfter; boundary++) {
    const beforeWords = clueWords.slice(0, boundary).reduce((sum, words) => sum + words, 0);
    const ratio = beforeWords / Math.max(1, totalWords);
    candidates.push({ boundary, ratio, distance: Math.abs(0.64 - ratio) });
  }
  const legal = candidates.filter(item => item.ratio >= profile.minPower && item.ratio <= profile.maxPower);
  const chosen = (legal.length ? legal : candidates).sort((a, b) => a.distance - b.distance)[0];
  if (!chosen) return { ...question, text: rawText };

  const before = clues.slice(0, chosen.boundary).join(' ');
  const after = clues.slice(chosen.boundary).join(' ');
  return {
    ...question,
    text: `${before} (*) ${after}`.trim(),
    answer: String(question?.answer || question?.answerline || '').trim(),
  };
}

export function buildPyramidalWritingInstructions({ difficulty = 'Medium', grounded = false } = {}) {
  const profile = pyramidProfile(difficulty);
  const targetWords = profile.label === 'tournament' ? '130-190' : profile.label === 'hard' ? '110-165' : profile.label === 'easy' ? '80-125' : '95-145';
  return `DEEP PYRAMID CONTRACT (non-negotiable):
- Each tossup is ${targetWords} words and has at least ${profile.minSentences} complete entries in its "clues" array. Each entry is one independently useful clue sentence. A short trivia paragraph with one obscure opener is invalid.
- Sentence 1: a genuinely specialist lead-in—minor work, technical result, named secondary figure, precise quotation context, obscure episode, or advanced defining property. Never open with birthplace, job title, century, nationality, or the answer's most famous association.
- Sentence 2: a second independent specialist clue from a different context. It must narrow the answer without paraphrasing sentence 1.
- Sentences 3-4: hard-to-medium clues that connect the specialist evidence to recognizable works, events, mechanisms, or relationships. Each sentence contributes a new fact.
- Do not put a (*) marker inside any clue. The application places the power mark at a legal sentence boundary after generation.
- The final two array entries are progressively easier sentences: first a well-known distinguishing clue, then a concise canonical giveaway. The final clue may be accessible, but it must not simply repeat the category or topic.
- Use at least six independently useful facts. Do not inflate length with biography filler, vague praise, lists of generic descriptors, or multiple phrasings of one clue.
- Difficulty must decrease monotonically: every successive clue should be at least as accessible as the previous clue. Never put the hardest named detail in the final two clues.
- The answer string and obvious aliases must not appear in the clue text. The topic is a scope label, not an answer line.
- Before returning the set, silently label every sentence as lead-in / early / middle / late / giveaway and rewrite any tossup whose ladder is flat.${grounded ? '\n- When source-grounded, build the same deep ladder only from facts actually present in the source. If the source cannot support six independent facts for an answer, choose a better-supported answer instead of inventing clues.' : ''}`;
}

export function filterPyramidalTossups(questions, options = {}) {
  const { topic = '', difficulty = '', ...diversityOptions } = options;
  return filterDiverseQuestions(
    (Array.isArray(questions) ? questions : []).map(question => normalizeGeneratedTossup(question, { difficulty })),
    {
      ...diversityOptions,
      validateQuestion: question => validatePyramidalTossup(question, { topic, difficulty }),
    },
  );
}

export function buildQuestionDiversityInstructions({
  category = 'Mixed',
  count = 10,
  seed = Date.now(),
  grounded = false,
} = {}) {
  const safeCount = Math.max(1, Math.min(50, Number(count) || 10));
  const isMixed = String(category).toLowerCase() === 'mixed';
  let distribution;

  if (isMixed && !grounded) {
    const order = seededShuffle(MIXED_CATEGORIES, seed);
    const slots = Array.from({ length: safeCount }, (_, index) => order[index % order.length]);
    distribution = `Use this exact category slot plan, in order:\n${slots.map((slot, index) => `${index + 1}. ${slot}`).join('\n')}`;
  } else {
    distribution = grounded
      ? 'Spread the set across as many distinct people, works, events, places, concepts, and sections of the source as it genuinely supports.'
      : `Within ${category}, deliberately spread the set across distinct subtopics, eras, answer types, and schools of thought. Do not cluster around the most famous two or three answers.`;
  }

  return `QUESTION DIVERSITY CONTRACT (required):
- ${distribution}
- Choose the full answer slate before writing clues. Every answer must be distinct; aliases, surnames, alternate titles, and members of the same obvious answer family do not count as distinct.${grounded ? ' If the source truly cannot support distinct answers, reuse an answer only as a last resort and use a completely different section and clue path.' : ''}
- No two questions may test the same underlying fact, event, work, person, theorem, or relationship.
- Vary the clue path and giveaway style. Do not reuse the same opening template, signature clue, or final-sentence pattern.
- Add a "category" and a short "coverageTag" to every question. coverageTag must name the unique subtopic/angle and must not repeat within the set.
- Diversity seed: ${String(seed)}. Use it to choose a fresh answer slate; do not default to the most common stock examples.`;
}

export function buildHistoricalClueInstructions({ topic = '', guide = null } = {}) {
  const cleanTopic = String(topic || '').trim();
  const clueTerms = Array.isArray(guide?.clueTerms) ? guide.clueTerms.slice(0, 18) : [];
  const answerLines = Array.isArray(guide?.relatedAnswers) ? guide.relatedAnswers.slice(0, 28) : [];
  if (!cleanTopic) return '';
  return `HISTORICAL CLUE RESEARCH (required):
- The packet topic is "${cleanTopic}". It is a scope label, NOT an answer line: do not answer "${cleanTopic}" or a trivial variant of it.
- Build the set around distinct people, works, places, events, concepts, causes, consequences, and institutions connected to that topic.
${answerLines.length ? `- Past human-written tossups on this topic point to these related answer lines. Use them as an answer-slate research aid, not a list to copy: ${answerLines.join('; ')}.` : ''}
${clueTerms.length ? `- These clue terms recur in past human-written tossups: ${clueTerms.join('; ')}. Use the underlying facts to choose authentic clue paths, but never copy a sentence or imitate a single source question.` : ''}
- Every tossup must move through at least three clue layers: specialist/early-pyramid evidence, a distinguishing middle clue, then an accessible giveaway. Do not front-load the topic name or its most famous one-line fact.`;
}

export function buildQuestionRefillInstructions({ accepted = [], missing = 1, seed = Date.now() } = {}) {
  const answers = accepted.map(question => question?.answer).filter(Boolean);
  const tags = accepted.map(question => question?.coverageTag).filter(Boolean);
  return `The first draft did not pass diversity checks. Generate exactly ${Math.max(1, Number(missing) || 1)} replacement questions.
Do not use these accepted answers or aliases: ${answers.length ? answers.join('; ') : '(none)'}.
Do not reuse these coverage angles: ${tags.length ? tags.join('; ') : '(none)'}.
Use new answer families, new subtopics, and substantially different clue vocabulary. Replacement seed: ${String(seed)}.`;
}

export function buildAssessmentDiversityInstructions({ count = 5, seed = Date.now() } = {}) {
  const safeCount = Math.max(1, Math.min(50, Number(count) || 5));
  const operations = seededShuffle([
    'conceptual understanding',
    'application to a new scenario',
    'analysis or comparison',
    'cause-and-effect reasoning',
    'error or misconception diagnosis',
    'evidence-based inference',
    'multi-step synthesis',
    'precise factual recall',
  ], seed);
  const slots = Array.from({ length: safeCount }, (_, index) => operations[index % operations.length]);
  return `SET-LEVEL VARIABILITY CONTRACT (required):
- Plan all ${safeCount} questions before writing them. Assign one distinct learning target to every slot and rotate the reasoning operations below instead of clustering on one style.
- Reasoning-operation slots, in order: ${slots.map((slot, index) => `${index + 1}) ${slot}`).join('; ')}.
- Cover the topic/source broadly instead of repeatedly testing its title, opening section, most famous fact, or one missed concept.
- Changing only names, numbers, answer choices, or surface wording does not make a question distinct.
- Do not reuse the same scenario, fact relationship, misconception, calculation structure, or required inference.
- Silently compare every pair before returning the set and rewrite any pair that tests substantially the same knowledge or reasoning.
- Variability seed: ${String(seed)}.`;
}
