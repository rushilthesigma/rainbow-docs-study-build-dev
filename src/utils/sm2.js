// SM-2 Spaced Repetition Algorithm
// quality: 0 = blackout, 1 = fail, 2 = fail but familiar, 3 = correct hard, 4 = correct, 5 = perfect
export function sm2Update(card, quality) {
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = card;
  const q = Math.max(0, Math.min(5, Math.round(Number(quality))));

  if (q < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }

  ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + interval);

  return {
    ...card,
    ease: Math.round(ease * 100) / 100,
    interval,
    reps,
    lapses,
    nextDue: nextDue.toISOString(),
    lastReviewed: new Date().toISOString(),
  };
}

export function isDue(card) {
  if (!card.nextDue && !card.nextReview) return true;
  const due = card.nextDue || card.nextReview;
  return new Date(due) <= new Date();
}

// How many days until this card is due (negative = already overdue).
export function daysUntilDue(card) {
  const due = card.nextDue || card.nextReview;
  if (!due) return 0;
  return Math.round((new Date(due) - new Date()) / 86400000);
}

// Human-readable interval label for a day count.
export function intervalLabel(days) {
  if (!days || days <= 0) return '<1d';
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

// Predict the next interval (in days) if the user rates this quality now.
export function sm2NextInterval(card, quality) {
  return sm2Update(card, quality).interval;
}

// Map a 0-1 buzz ratio to SM-2 quality (0-5)
// buzzRatio: how far into question user buzzed (0=start, 1=end)
// correct: boolean
export function buzzToQuality(correct, buzzRatio) {
  if (!correct) return 1;
  if (buzzRatio < 0.3) return 5;  // buzzed very early, perfect recall
  if (buzzRatio < 0.5) return 4;  // buzzed early
  if (buzzRatio < 0.7) return 3;  // buzzed mid
  return 2;                        // needed almost all the clues
}
