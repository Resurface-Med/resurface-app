/*
 * How other people answered a question: real first answers only.
 *
 * Nothing is shown until PEER_MIN people have answered. option_split returns
 * no rows below that, so a thin sample never leaves the database; the check
 * here is a second guard. There is no stand-in: the last version (967cdd8)
 * showed an estimate below the threshold, and the estimate was what people
 * saw (taken off in 791981a). Keep PEER_MIN in step with option_split.
 *
 * Picks are stored as the option's text, which survives the per-person
 * shuffle and a question being re-alphabetised after a fix.
 */

export const PEER_MIN = 10;

/** Integer parts that sum to `total`, following the fractional remainders. */
function apportion(exact, total) {
  const floors = exact.map(x => Math.floor(x));
  const left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < left; k++) floors[order[k].i] += 1;
  return floors;
}

/**
 * `rows` from option_split ({ option_text, n }) → percentages in the order
 * the options are on screen, plus how many people that is. Null when there
 * is nothing real to show.
 */
export function splitFor(opts, rows) {
  if (!Array.isArray(opts) || !opts.length || !Array.isArray(rows) || !rows.length) return null;
  const byText = new Map(rows.map(r => [r.option_text, Number(r.n) || 0]));
  const counts = opts.map(t => byText.get(t) ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < PEER_MIN) return null;
  return { pcts: apportion(counts.map(c => (c * 100) / total), 100), total };
}
