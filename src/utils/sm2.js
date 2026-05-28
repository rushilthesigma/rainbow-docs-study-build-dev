// SM-2 Spaced Repetition Algorithm
// quality: 0 = blackout, 1 = fail, 2 = fail but familiar, 3 = correct hard, 4 = correct, 5 = perfect
export function sm2Update(card, quality) {
  let { ease = 2.5, interval = 1, reps = 0 } = card;

  if (quality < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }

  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + interval);

  return {
    ...card,
    ease: Math.round(ease * 100) / 100,
    interval,
    reps,
    nextDue: nextDue.toISOString(),
    lastReviewed: new Date().toISOString(),
  };
}

export function isDue(card) {
  if (!card.nextDue) return true;
  return new Date(card.nextDue) <= new Date();
}

// Map a 0-1 buzz accuracy to SM-2 quality (0-5)
// buzzRatio: how far into question user buzzed (0=start, 1=end)
// correct: boolean
export function buzzToQuality(correct, buzzRatio) {
  if (!correct) return 1;
  if (buzzRatio < 0.3) return 5;  // buzzed very early, perfect recall
  if (buzzRatio < 0.5) return 4;  // buzzed early
  if (buzzRatio < 0.7) return 3;  // buzzed mid
  return 2;                        // needed almost all the clues
}
