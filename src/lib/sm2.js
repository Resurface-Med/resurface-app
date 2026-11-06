// SM-2 with Anki-style improvements
// quality: 1=Again, 2=Hard, 3=Good, 4=Easy. The app only sends 1 (wrong) and
// 3 (right): there is no self-rating.
//
// Retuned 2026-11-06 from the answer log (12,878 answers, 54 people, 12 days)
// and the spacing literature, after a report that questions came due too soon.
//
// What the log showed. After one right answer, people got it right again 88%
// of the time a day later, 86% at 2-3 days and 86% at 4-9 days: memory barely
// fell between day 1 and day 9, so the day-1 review spent effort while it was
// still strong. After two in a row, 88-93% at 4-9 days. A wrong answer used to
// make the question due one minute later (1,783 cards sat "due" that way), and
// a re-ask within the hour was 89% right, because the explanation had just
// been read, so it measured short-term memory and filled the Due pile.
//
// What the research says. The best gap before a review is a fraction of the
// time until it must be remembered: ~20-40% for a week, falling to ~5-10% for
// a year (Cepeda et al. 2008, Psychological Science). Delaying the first
// retrieval matters more for long-term retention than how later gaps grow
// (Karpicke & Roediger 2007, JEP:LMC). Retrievals that take effort but succeed
// strengthen memory more (Pyc & Rawson 2009; Bjork's desirable difficulties).
//
// So: a wrong answer comes back tomorrow, not in a minute; a first right
// answer waits 3 days, not 1; a second waits 10, not 6; after that the
// interval grows by the ease factor as before. Re-check against the log once
// there is more of it, and consider FSRS then.

const DAY = 24 * 60 * 60 * 1000;
export const STEPS = { wrong: 1, first: 3, relearned: 2, second: 10 };

export function sm2Review(card, quality) {
  let { interval = 0, repetitions = 0, easeFactor = 2.5, lapses = 0 } = card || {};

  if (quality === 1) {
    // Again: start over, tomorrow. The explanation is the immediate learning;
    // the next retrieval is worth more after a night's gap than a minute's.
    lapses += repetitions > 0 ? 1 : 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    // interval stays 0 (not learnt; progress counts by interval), due tomorrow.
    return { interval: 0, repetitions: 0, easeFactor, dueDate: Date.now() + STEPS.wrong * DAY, lapses };
  }

  if (quality === 2 && repetitions === 0) {
    // Hard on a card not yet learnt: tomorrow, a little less ease.
    return { interval: 0, repetitions: 0, easeFactor: Math.max(1.3, easeFactor - 0.15), dueDate: Date.now() + DAY, lapses };
  }

  if (quality === 2) {
    interval = Math.max(1, Math.round(interval * 1.2));
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (quality === 3) {
    // A card relearnt after a wrong answer starts a little shorter than a
    // brand-new one got right first time.
    if (repetitions === 0) interval = lapses > 0 || card?.easeFactor < 2.5 ? STEPS.relearned : STEPS.first;
    else if (repetitions === 1) interval = STEPS.second;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  } else {
    // Easy
    if (repetitions === 0) interval = 4;
    else if (repetitions === 1) interval = 12;
    else interval = Math.round(interval * easeFactor * 1.3);
    repetitions += 1;
    easeFactor = Math.min(3.0, easeFactor + 0.15);
  }

  // ±5% fuzz to prevent cards clustering on the same day
  const fuzz = 1 + (Math.random() * 0.1 - 0.05);
  interval = Math.max(1, Math.min(365, Math.round(interval * fuzz)));

  const dueDate = Date.now() + interval * DAY;
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

/**
 * Due for *review* — a card you have already studied whose interval has
 * elapsed. Unlike isDue, a card you have never seen is not due: it is new.
 *
 * isDue answers "may this be served?", which is why it says yes to unseen
 * cards. Reporting that number as "due" told a brand-new account it had 497
 * questions ready to review, next to "Seen: 0". Two questions, two functions.
 */
export function isReviewDue(card) {
  return Boolean(card && card.dueDate && Date.now() >= card.dueDate);
}
