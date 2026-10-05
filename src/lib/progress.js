/**
 * Counting progress against questions that still exist.
 *
 * Progress is stored by question id and lives longer than the questions do.
 * Delete a deck, remove a question, stop shipping a bank — the rows stay, and
 * any count taken from them is a count of things that are no longer there.
 * Reading "you have seen 100 of 20" is what that looks like.
 *
 * So the rule, and the only thing this file exists to enforce: anything shown
 * as a fraction of the questions you have must be counted by walking the
 * questions you have, not by measuring the stored rows. A tally taken from
 * the same source as its total cannot exceed it, whatever is left over in the
 * database.
 *
 * All-time totals are a different question and stay honest about history: how
 * many you have answered, and how often you were right, are true of things
 * you can no longer revisit.
 */

/** How many of these questions have ever been attempted. */
export function seenCount(questions, pStats) {
  if (!questions || !pStats) return 0;
  let n = 0;
  for (const q of questions) if (pStats[q.id]) n += 1;
  return n;
}

/** How many of these questions are scheduled far enough out to call learnt. */
export function masteredCount(questions, srCards, days) {
  if (!questions || !srCards) return 0;
  let n = 0;
  for (const q of questions) {
    const c = srCards[q.id];
    if (c && (c.interval ?? 0) >= days) n += 1;
  }
  return n;
}

/**
 * A share of a total, safe at the edges.
 *
 * Nought over nought is nought rather than NaN, which is what reaches the
 * screen as a bar of width "NaN%" and silently paints nothing. And it cannot
 * exceed one, so a stale count can never draw past the end of its track.
 */
export function share(part, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(1, part / total));
}
