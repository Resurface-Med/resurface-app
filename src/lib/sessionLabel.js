/**
 * What a practice session was on, named from the decks its questions sit
 * in — by the deepest deck they all share, which is the one that was picked.
 *
 * It used to count the smallest decks the questions came from, so a session
 * on Year 2 › Renal, whose seventeen topics are each a deck of their own,
 * read "Year 2 · 17 decks" (Rafil, 2026-10-20). Now:
 *
 *   all in one deck                 "Renal › Glomerulus" (its last two levels)
 *   across a deck's own decks       "Year 2 › Renal"     (the deck they share)
 *   two decks in a top deck         "Year 2 › Renal and Cardio"
 *   more than two                   "Year 2 · 3 decks"   (the decks just inside it)
 *   different top decks             "Year 1 and Year 2", or "3 decks"
 *
 * Used for Study's "Continue this session?" banner and Past sessions.
 */
const names = q => (q?.path ?? []).map(p => p.name).filter(Boolean);

export function sessionLabel(questions) {
  const paths = (questions ?? []).filter(Boolean).map(q => {
    const n = names(q);
    return n.length ? n : [q.block, q.cat].filter(Boolean);
  }).filter(p => p.length);
  if (!paths.length) return "Practice";

  /* The path every question shares. */
  let common = paths[0];
  for (const p of paths) {
    let i = 0;
    while (i < common.length && i < p.length && common[i] === p[i]) i++;
    common = common.slice(0, i);
  }

  /* The decks just below it that the questions come from. */
  const next = [...new Set(paths.map(p => p[common.length]).filter(Boolean))];
  const last2 = c => c.slice(-2).join(" › ");
  const both = list => `${list[0]} and ${list[1]}`;

  if (!common.length) return next.length === 2 ? both(next) : `${next.length} decks`;
  /* Inside a deck (below the top one), the deck they share is the name:
     picking Renal is picking all its topics. */
  if (next.length <= 1 || common.length >= 2) return last2(common);
  const where = common[common.length - 1];
  return next.length === 2 ? `${where} › ${both(next)}` : `${where} · ${next.length} decks`;
}
