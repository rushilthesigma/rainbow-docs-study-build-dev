import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClueBanInstructions,
  buildQuestionDiversityInstructions,
  buildAssessmentDiversityInstructions,
  collectBannedClues,
  filterDiverseQuestions,
  filterPyramidalTossups,
  findReusedClue,
  normalizeGeneratedTossup,
  normalizeQuestionAnswer,
  validatePyramidalTossup,
} from './questionDiversity.js';

test('normalizes answer directives and aliases', () => {
  assert.equal(normalizeQuestionAnswer('George Washington [accept Washington]'), 'george washington');
  assert.equal(normalizeQuestionAnswer('<b>Hamlet</b> (play)'), 'hamlet');
});

test('filters canonical answer repeats and highly similar clue text', () => {
  const questions = [
    { text: 'This leader crossed the Delaware and served as the first president.', answer: 'George Washington' },
    { text: 'This general crossed the Delaware before becoming the first president.', answer: 'Washington' },
    { text: 'This leader crossed the Delaware and served as the first president of the nation.', answer: 'John Adams' },
    { text: 'This physicist developed general relativity after work on special relativity.', answer: 'Albert Einstein' },
  ];
  const result = filterDiverseQuestions(questions);
  assert.deepEqual(result.accepted.map(q => q.answer), ['George Washington', 'Albert Einstein']);
  assert.deepEqual(result.rejected.map(q => q.reason), ['duplicate-answer', 'similar-clues']);
});

test('mixed-category contract creates an exact varied slot plan', () => {
  const prompt = buildQuestionDiversityInstructions({ category: 'Mixed', count: 6, seed: 'fixed' });
  const slots = prompt.split('\n').filter(line => /^\d+\. /.test(line));
  assert.equal(slots.length, 6);
  assert.equal(new Set(slots.map(line => line.replace(/^\d+\. /, ''))).size, 6);
});

test('assessment mode checks prompt similarity without treating answer letters as duplicates', () => {
  const questions = [
    { question: 'Which process converts light energy into chemical energy?', correct: 'A' },
    { question: 'Which organelle is the site of cellular respiration?', correct: 'A' },
  ];
  const result = filterDiverseQuestions(questions, { checkAnswerDiversity: false });
  assert.equal(result.accepted.length, 2);
  assert.match(buildAssessmentDiversityInstructions({ count: 2, seed: 'test' }), /Plan all 2 questions/);
});

test('rejects a topic answer and malformed pyramidal tossups', () => {
  const valid = 'This ruler supported the lesser-known commander Johan Baner and relied on Chancellor Axel Oxenstierna to administer his realm. His forces used lighter mobile artillery and coordinated salvo fire with unusually flexible brigades. He landed in Pomerania after issuing a manifesto defending Protestant liberties in the Empire. His victory at Breitenfeld broke an army commanded by Tilly and opened central Germany to his coalition. (*) He later fought Wallenstein at a fog-shrouded battle where he was separated from his cavalry. His daughter Christina inherited his northern European throne after his death at Lutzen. For 10 points, name this Swedish king and champion of the Protestant cause in the Thirty Years War.';
  const result = filterPyramidalTossups([
    { text: valid, answer: 'Gustavus Adolphus' },
    { text: valid.replace('Gustavus Adolphus', 'Thirty Years War'), answer: 'Thirty Years War' },
  ], { topic: 'Thirty Years War' });
  assert.deepEqual(result.accepted.map(q => q.answer), ['Gustavus Adolphus']);
  assert.equal(result.rejected[0].reason, 'topic-as-answer');
  assert.equal(validatePyramidalTossup({
    text: valid.replace('name this Swedish king', 'name Gustavus Adolphus, this Swedish king'),
    answer: 'Gustavus Adolphus',
  }), 'answer-leaked-in-clue');
  assert.equal(validatePyramidalTossup({ text: valid.replace('(*) ', ''), answer: 'Gustavus Adolphus' }), 'invalid-power-mark');
});

test('rejects shallow tossups that only imitate a pyramid', () => {
  const shallow = 'This scientist studied light. This scientist worked in Europe. (*) This scientist developed relativity. For 10 points, name this physicist.';
  const result = filterPyramidalTossups([{ text: shallow, answer: 'Albert Einstein' }], { difficulty: 'Medium' });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'too-short-for-pyramidal');
});

test('assembles explicit clue arrays into a legal power-marked tossup', () => {
  const generated = normalizeGeneratedTossup({
    clues: [
      'This ruler backed the lesser-known commander Johan Baner and used Chancellor Axel Oxenstierna to regularize provincial administration.',
      'His crown negotiated the Treaty of Altmark after campaigns in Livonia and Prussia against the Polish-Lithuanian Commonwealth.',
      'He refined the allotment system while integrating light regimental guns with unusually flexible infantry brigades.',
      'His army crossed from Pomerania after a manifesto framed intervention as a defense of imperial liberties.',
      'At Breitenfeld, his reserve line recovered captured artillery after Tilly attacked the Saxon flank.',
      'He later confronted Wallenstein in fog near Leipzig while leading a cavalry charge.',
      'His daughter Christina succeeded him after his death at Lutzen; name this Swedish king.',
    ],
    answer: 'Gustavus Adolphus',
  }, { difficulty: 'Medium' });
  assert.equal((generated.text.match(/\(\*\)/g) || []).length, 1);
  assert.equal(validatePyramidalTossup(generated, { difficulty: 'Medium' }), null);
});

test('tournament tossups require a longer, deeper pyramid', () => {
  const standard = 'This ruler supported Johan Baner and relied on Axel Oxenstierna to administer his realm. His forces used mobile artillery and coordinated salvo fire with flexible brigades. He landed in Pomerania after defending Protestant liberties in the Empire. His victory at Breitenfeld broke an army commanded by Tilly. (*) He later fought Wallenstein at a fog-shrouded battle. His daughter Christina inherited his throne after his death at Lutzen. For 10 points, name this Swedish king from the Thirty Years War.';
  assert.equal(
    validatePyramidalTossup({ text: standard, answer: 'Gustavus Adolphus' }, { difficulty: 'Tournament' }),
    'too-short-for-tournament',
  );

  const tournament = 'This ruler backed the lesser-known commander Johan Baner and used the chancellor Axel Oxenstierna to regularize provincial administration. His crown negotiated the Treaty of Altmark after campaigns in Livonia and Prussia against the Polish-Lithuanian Commonwealth. He refined the indelningsverket allotment system while integrating light regimental guns with flexible infantry brigades. His army crossed from Pomerania after he issued a manifesto framing intervention as a defense of imperial liberties. At Breitenfeld, his reserve line wheeled to recover captured artillery after Tilly attacked the Saxon flank. (*) He later confronted Wallenstein in fog near Leipzig while leading a cavalry charge. His daughter Christina succeeded him after that battle at Lutzen. For 10 points, name this Swedish king whose intervention transformed the Protestant position in the Thirty Years War.';
  assert.equal(
    validatePyramidalTossup({ text: tournament, answer: 'Gustavus Adolphus' }, { difficulty: 'Tournament' }),
    null,
  );
});

test('collects banned clues only from the most recent sets', () => {
  const makeSet = sentence => ({ perQuestion: [{ text: sentence }] });
  const sets = [
    makeSet('This composer wrote the Goldberg Variations for the insomniac Count Keyserlingk.'),
    ...Array.from({ length: 7 }, (_, i) => makeSet(`Distinct filler clue number ${i} mentioning specific historical circumstances repeatedly.`)),
    makeSet('This painter completed Guernica after the bombing of a Basque town.'),
  ];
  const clues = collectBannedClues(sets);
  assert.ok(clues.some(c => c.sentence.includes('Goldberg Variations')));
  assert.ok(!clues.some(c => c.sentence.includes('Guernica')), 'sets beyond the 8 most recent must not contribute clues');
  // Sentences too short to identify a fact are skipped.
  assert.equal(collectBannedClues([makeSet('Name this king.')]).length, 0);
});

test('rejects questions that reuse a clue from a recent set, even reworded', () => {
  const bannedClues = collectBannedClues([{
    perQuestion: [{ text: 'This ruler supported the lesser-known commander Johan Baner and relied on Chancellor Axel Oxenstierna to administer his realm.' }],
  }]);
  const reworded = 'Chancellor Axel Oxenstierna helped this ruler govern while he supported the commander Johan Baner in Germany. His daughter Christina inherited his throne.';
  assert.ok(findReusedClue(reworded, bannedClues));
  const fresh = 'This physicist developed general relativity after earlier publications on the photoelectric effect. He spent his final years at Princeton.';
  assert.equal(findReusedClue(fresh, bannedClues), null);

  const result = filterDiverseQuestions([
    { text: reworded, answer: 'Gustavus Adolphus' },
    { text: fresh, answer: 'Albert Einstein' },
  ], { bannedClues });
  assert.deepEqual(result.accepted.map(q => q.answer), ['Albert Einstein']);
  assert.equal(result.rejected[0].reason, 'reused-past-clue');
});

test('clue ban prompt block lists banned sentences under a hard rule', () => {
  assert.equal(buildClueBanInstructions({ clues: [] }), '');
  const clues = collectBannedClues([{
    perQuestion: [{ text: 'This composer wrote the Goldberg Variations for the insomniac Count Keyserlingk.' }],
  }]);
  const block = buildClueBanInstructions({ clues });
  assert.match(block, /BANNED CLUE MATERIAL/);
  assert.match(block, /last 8 sets/);
  assert.match(block, /Goldberg Variations/);
});
