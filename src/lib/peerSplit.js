/*
 * How the cohort split on a question.
 *
 * Once PEER_MIN distinct people have answered, the percentages are theirs.
 * Before that there isn't a split worth showing, so the number is a stable
 * stand-in for this question: the same one for everybody, and it gives way
 * the moment the real tally crosses the line. option_split returns nothing
 * until then, so a thin sample never reaches the screen. Keep PEER_MIN in
 * step with that function.
 */

export const PEER_MIN = 20;

function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer parts that sum to `total`, following the fractional remainders. */
function apportion(exact, total) {
  const floors = exact.map(x => Math.floor(x));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < left; k++) floors[order[k].i] += 1;
  return floors;
}

/* A wrong option below this reads as "only you picked it". The stand-in
   keeps every distractor in a group, and one of them close behind the
   right answer, so missing it feels like a common miss. Real tallies
   are not adjusted. */
function floorFor(others) {
  if (others <= 1) return 40;
  if (others === 2) return 18;
  if (others === 3) return 15;
  if (others === 4) return 13;
  return Math.max(8, Math.floor(48 / others));
}

function standIn(id, n, correctIndex) {
  if (n <= 0) return [];
  if (n === 1) return [100];
  const correct = Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < n
    ? correctIndex
    : 0;
  const rand = mulberry32(hashId(id) ^ Math.imul(n, 0x9e3779b1));
  const others = n - 1;
  const floor = floorFor(others);
  const minTrap = others === 1 ? floor : Math.max(floor + 6, Math.min(22, 100 - floor * (others - 1) - 30));
  const maxCorrect = 100 - (others - 1) * floor - minTrap;
  const hard = others > 1 && (hashId(id) % 5) === 0;

  let correctPct = others === 1
    ? 54 + Math.floor(rand() * 8)
    : hard
      ? 28 + Math.floor(rand() * 3)
      : Math.max(34, maxCorrect - 6) + Math.floor(rand() * 6);
  if (correctPct > maxCorrect) correctPct = maxCorrect;

  const spare = 100 - correctPct - others * floor;
  const trapAt = Math.floor(rand() * others);
  const parts = Array(others).fill(floor);
  const trapNeeds = Math.max(0, minTrap - floor);
  const sprinkle = hard ? 0 : Math.min(Math.max(0, spare - trapNeeds), others - 1, 1 + Math.floor(rand() * 3));
  parts[trapAt] += spare - sprinkle;
  for (let i = 0, left = sprinkle; i < others && left > 0; i++) {
    if (i === trapAt) continue;
    parts[i] += 1;
    left -= 1;
  }

  const out = Array(n).fill(0);
  out[correct] = correctPct;
  let j = 0;
  for (let i = 0; i < n; i++) if (i !== correct) out[i] = parts[j++];
  return out;
}

/** Real tally → percentages that sum to 100. Missing options are 0. */
export function fromCounts(counts, n) {
  const c = Array.from({ length: n }, (_, i) => Math.max(0, Number(counts?.[i]) || 0));
  const total = c.reduce((a, b) => a + b, 0);
  if (total <= 0) return Array(n).fill(0);
  return apportion(c.map(x => (x * 100) / total), 100);
}

/**
 * One integer percent per canonical option, summing to 100.
 * `counts` is how many distinct people picked each index, or null when
 * that tally isn't being used.
 */
export function peerPercents(questionId, n, correctIndex, counts) {
  if (Array.isArray(counts)) {
    const total = counts.reduce((a, b) => a + (Number(b) || 0), 0);
    if (total >= PEER_MIN) return fromCounts(counts, n);
  }
  return standIn(questionId, n, correctIndex);
}

/* Display slot → canonical index, from the shuffle map or by matching the
   words back onto the question as stored. Null when it can't be done
   without guessing. */
export function optionSources(q, liveOpts) {
  const n = q?.opts?.length ?? 0;
  if (!n) return null;
  const order = q.optOrder;
  if (Array.isArray(order) && order.length === n
      && order.every(i => Number.isInteger(i) && i >= 0 && i < n)) {
    return order;
  }
  if (Array.isArray(liveOpts) && liveOpts.length === n) {
    const src = q.opts.map(text => liveOpts.indexOf(text));
    if (src.every(i => i >= 0)) return src;
  }
  return null;
}

/** Percents in the order the options are on screen. */
export function displayPeerPcts(q, counts, liveOpts) {
  const n = q?.opts?.length ?? 0;
  if (!n) return [];
  const order = optionSources(q, liveOpts);
  const correct = order ? order[q.ans] : q.ans;
  const base = peerPercents(q.id, n, correct, Array.isArray(counts) ? counts : null);
  if (!order) return base;
  return q.opts.map((_, i) => base[order[i]] ?? 0);
}

/** The stored index for the option they picked, or null if it can't be mapped. */
export function canonicalPick(q, displayIndex, liveOpts) {
  const order = optionSources(q, liveOpts);
  if (!order) return null;
  const i = order[displayIndex];
  return Number.isInteger(i) ? i : null;
}
