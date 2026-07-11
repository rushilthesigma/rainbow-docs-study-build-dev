import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeQuizBowlAnswer } from './qbAnswerChecker.js';

const answerline = '<b><u>Albert Einstein</u></b> [accept Einstein; prompt on Albert; reject Mileva Marić]';

test('uses QBReader answerline directives', () => {
  assert.equal(judgeQuizBowlAnswer(answerline, 'Einstein').directive, 'accept');
  assert.equal(judgeQuizBowlAnswer(answerline, 'Albert').directive, 'prompt');
  assert.equal(judgeQuizBowlAnswer(answerline, 'Mileva Marić').directive, 'reject');
});
