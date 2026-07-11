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
