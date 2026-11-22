/**
 * Writes sent together (2026-11-22, migration 0098).
 *
 * An answer used to send five to seven requests — the answer log, the
 * option picked, practice_stats, sr_cards, activity, the streak, the
 * session — and study time sent one every 15 s on top. lib/remote holds the
 * writes of these kinds for a moment and sends them to write_batch as one.
 *
 * Pure, so it can be tested: which kinds go, the row each writes (the same
 * columns its own request wrote, minus user_id, which the server takes from
 * the sign-in), and which replace an earlier one. practice, sr, activity,
 * the streak, study time and the session are absolute values, so only the
 * newest of each needs to go; answers and picks are rows of their own.
 */

const iso = v => (v ? new Date(v).toISOString() : null);

export const BATCHED = {
  practice: {
    row: op => ({ question_id: op.questionId, correct: op.correct, total: op.total }),
    key: op => `practice:${op.questionId}`,
  },
  pick: {
    row: op => ({ question_id: op.questionId, option_text: op.optionText ?? null, option_index: op.optionIndex ?? null }),
  },
  answer: {
    row: op => ({ question_id: op.questionId, correct: op.correct, ms: op.ms ?? null, at: op.answeredAt ?? iso(op.at) }),
  },
  sr: {
    row: op => ({
      question_id: op.questionId,
      interval: op.card?.interval ?? 0,
      repetitions: op.card?.repetitions ?? 0,
      ease_factor: op.card?.easeFactor ?? 2.5,
      lapses: op.card?.lapses ?? 0,
      due_date: iso(op.card?.dueDate),
      interval_minutes: op.card?.intervalMinutes ?? null,
    }),
    key: op => `sr:${op.questionId}`,
  },
  activity: {
    row: op => ({ day: op.day, count: op.count }),
    key: op => `activity:${op.day}`,
  },
  streak: {
    row: op => ({ current: op.current, longest: op.longest, last_date: op.lastDate ?? null }),
    key: () => "streak",
  },
  /* Lazy: waits for the next answer, or half a minute, rather than going on
     its own every 15 s. */
  "study-time": {
    row: op => ({ secs: op.seconds }),
    key: () => "study-time",
    lazy: true,
  },
  "session-save": {
    row: op => op.rec,
    key: op => `session:${op.rec?.id}`,
  },
};

/** Whether this op goes in a batch: a kind write_batch takes, made by the
    account that is signed in now (a parked write of another account's must
    not land in this one's rows). */
export function batchable(op, owner) {
  return Boolean(BATCHED[op?.kind]) && Boolean(owner) && op.userId === owner;
}

/** The held ops with `op` added: an earlier op it replaces is dropped. */
export function addToBatch(held, op) {
  const key = BATCHED[op.kind]?.key?.(op);
  const kept = key ? held.filter(h => BATCHED[h.kind]?.key?.(h) !== key) : held;
  return [...kept, op];
}

/** What write_batch is sent. */
export function batchBody(ops) {
  return ops.map(op => ({ k: op.kind, r: BATCHED[op.kind].row(op) }));
}

/** True when every op held may wait (study time alone). */
export function allLazy(ops) {
  return ops.length > 0 && ops.every(op => BATCHED[op.kind]?.lazy);
}
