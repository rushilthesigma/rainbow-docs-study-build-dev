import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeQuizBowlAnswer, judgeQuizBowlQuestion } from './qbAnswerChecker.js';

const answerline = '<b><u>Albert Einstein</u></b> [accept Einstein; prompt on Albert; reject Mileva Marić]';

test('uses QBReader answerline directives', () => {
  assert.equal(judgeQuizBowlAnswer(answerline, 'Einstein').directive, 'accept');
  assert.equal(judgeQuizBowlAnswer(answerline, 'Albert').directive, 'prompt');
  assert.equal(judgeQuizBowlAnswer(answerline, 'Mileva Marić').directive, 'reject');
});

test('accepts equivalent geographic adjective and of-country forms', () => {
  const question = { answer: 'provinces of China', accept: [], prompt: [] };
  assert.equal(judgeQuizBowlQuestion(question, 'Chinese provinces').directive, 'accept');
  assert.equal(judgeQuizBowlQuestion(question, 'province of China').directive, 'accept');
});

test('does not turn merely similar place names into accepted answers', () => {
  const question = { answer: 'provinces of China', accept: [], prompt: [] };
  assert.equal(judgeQuizBowlQuestion(question, 'provinces of Japan').directive, 'reject');
});

test('does not generally accept reordered proper-name tokens', () => {
  const question = { answer: 'University of California', accept: [], prompt: [] };
  assert.equal(judgeQuizBowlQuestion(question, 'California University').directive, 'reject');
});
