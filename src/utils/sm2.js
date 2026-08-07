// SM-2 with Anki-style improvements
// quality: 1=Again, 2=Hard, 3=Good, 4=Easy
// New cards have learning steps: [1min, 10min] before graduating to days
// Lapses return to learning with a 10min step

export function sm2Review(card, quality) {
  let { interval = 0, repetitions = 0, easeFactor = 2.5, lapses = 0 } = card || {};

  const isNew = repetitions === 0;

  if (quality === 1) {
    // Again: back to first learning step
    lapses += repetitions > 0 ? 1 : 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    const stepMinutes = 1;
    const dueDate = Date.now() + stepMinutes * 60 * 1000;
    return { interval: 0, repetitions: 0, easeFactor, dueDate, lapses, intervalMinutes: stepMinutes };
  }

  if (quality === 2 && isNew) {
    // Hard on a new card: second learning step
    const stepMinutes = 10;
    const dueDate = Date.now() + stepMinutes * 60 * 1000;
    return { interval: 0, repetitions: 0, easeFactor: Math.max(1.3, easeFactor - 0.15), dueDate, lapses, intervalMinutes: stepMinutes };
  }

  if (quality === 2) {
    interval = Math.max(1, Math.round(interval * 1.2));
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (quality === 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  } else {
    // Easy
    if (repetitions === 0) interval = 4;
    else if (repetitions === 1) interval = 8;
    else interval = Math.round(interval * easeFactor * 1.3);
    repetitions += 1;
    easeFactor = Math.min(3.0, easeFactor + 0.15);
  }

  // ±5% fuzz to prevent cards clustering on the same day
  const fuzz = 1 + (Math.random() * 0.1 - 0.05);
  interval = Math.max(1, Math.min(365, Math.round(interval * fuzz)));

  const dueDate = Date.now() + interval * 24 * 60 * 60 * 1000;
  return { interval, repetitions, easeFactor, dueDate, lapses };
}

export function formatInterval(days, minutes) {
  if (minutes !== undefined) return `<${minutes}m`;
  if (!days || days < 1) return "<1d";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

export function getNextIntervals(card) {
  return [
    { label: "Again", quality: 1 },
    { label: "Hard",  quality: 2 },
    { label: "Good",  quality: 3 },
    { label: "Easy",  quality: 4 },
  ].map(r => {
    const result = sm2Review(card, r.quality);
    return {
      ...r,
      interval: result.interval,
      intervalMinutes: result.intervalMinutes,
      display: result.intervalMinutes !== undefined
        ? formatInterval(null, result.intervalMinutes)
        : formatInterval(result.interval),
    };
  });
}

export function isDue(card) {
  if (!card || !card.dueDate) return true;
  return Date.now() >= card.dueDate;
}
