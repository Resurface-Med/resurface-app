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

/* How a year actually splits, before anyone has answered.
 *
 * One formula makes every question look like the last one: the right
 * option in the mid-thirties, one distractor just behind, the rest
 * copies of each other. A paper is not like that. Some stems are
 * straightforward, some come down to two options, some have a trap
 * that beats the key. The shape is chosen from the question, then the
 * shares are drawn, so neighbouring questions do not wear the same
 * numbers. A distractor is kept off a sliver — 4% is "only you" — and
 * the real tally is never passed through this. */
const SHAPES = [
  { c: 8.4, t: 1.7, o: 0.42 },             // straightforward
  { c: 6.2, t: 2.1, o: 0.55 },             // comfortable
  { c: 4.4, t: 2.4, o: 0.62 },             // one real trap
  { c: 3.6, t: 2.15, s: 1.55, o: 0.48 },   // two ways to miss it
  { c: 3.15, t: 2.85, o: 0.58 },           // down to two options
  { c: 2.55, t: 3.05, o: 0.72 },           // the trap wins
  { c: 5.1, t: 1.35, o: 0.95 },            // the misses spread out
  { c: 3.9, t: 1.9, s: 1.25, o: 0.4 },     // a favourite miss and a long tail
];

/* Gamma(alpha, 1). Marsaglia and Tsang; alpha below 1 uses the
   standard boost. The mean is alpha, which is all the shapes need. */
function gamma(rand, alpha) {
  if (!(alpha > 0)) return 0;
  if (alpha < 1) {
    const u = Math.max(rand(), 1e-12);
    return gamma(rand, alpha + 1) * Math.pow(u, 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 64; i++) {
    let x;
    let v;
    do {
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return alpha;
}

/* Pull any option up to `floor` by taking from the largest share, and
   break a pile of identical tails by moving single points off the
   leader. Three 13s is the tell the last version had. */
function settle(out, floor) {
  const give = (from, to, amount) => {
    const moved = Math.min(amount, out[from] - floor);
    if (moved <= 0) return 0;
    out[from] -= moved;
    out[to] += moved;
    return moved;
  };
  for (let guard = 0; guard < out.length * 4; guard++) {
    const low = out.findIndex(v => v < floor);
    if (low < 0) break;
    let donor = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[donor]) donor = i;
    if (!give(donor, low, floor - out[low])) break;
  }
  for (let guard = 0; guard < 6; guard++) {
    const counts = new Map();
    out.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const piled = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0];
    if (!piled) break;
    const value = piled[0];
    const from = out.findIndex(v => v === Math.max(...out) && v > floor);
    const to = out.findIndex(v => v === value);
    if (from < 0 || to < 0 || from === to) break;
    if (!give(from, to, 1)) break;
  }
  return out;
}

function standIn(id, n, correctIndex) {
  if (n <= 0) return [];
  if (n === 1) return [100];
  const correct = Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < n
    ? correctIndex
    : 0;
  const rand = mulberry32(hashId(id) ^ Math.imul(n, 0x9e3779b1));
  const shape = SHAPES[hashId(String(id) + ":" + n) % SHAPES.length];
  const wrong = [];
  for (let i = 0; i < n; i++) if (i !== correct) wrong.push(i);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }

  const weights = Array(n).fill(0);
  weights[correct] = gamma(rand, shape.c);
  if (wrong[0] !== undefined) weights[wrong[0]] = gamma(rand, shape.t);
  if (shape.s && wrong[1] !== undefined) weights[wrong[1]] = gamma(rand, shape.s);
  for (let k = shape.s ? 2 : 1; k < wrong.length; k++) weights[wrong[k]] = gamma(rand, shape.o);
  /* Only the main trap may pass the key, and only just. Any other
     distractor that draws hot is pulled back, so a wrong option cannot
     run away with twice the right answer. */
  wrong.forEach((i, k) => {
    const limit = k === 0 ? 1.22 : 0.9;
    if (weights[i] > weights[correct] * limit) {
      const base = k === 0 ? 1.02 : 0.55;
      const span = k === 0 ? 0.18 : 0.3;
      weights[i] = weights[correct] * (base + rand() * span);
    }
  });

  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out = apportion(weights.map(w => (w / total) * 100), 100);
  /* 5% still draws a bar. Below that, the option you just chose looks
     like nobody else was there. Identical tails are then walked apart,
     because a row of the same number is the other tell. */
  const floor = n <= 2 ? 32 : n === 3 ? 8 : 5;
  settle(out, floor);
  const atFloor = [];
  let donor = 0;
  for (let i = 0; i < n; i++) {
    if (out[i] === floor) atFloor.push(i);
    if (out[i] > out[donor]) donor = i;
  }
  for (let k = 1; k < atFloor.length; k++) {
    const want = Math.min(2 * k, 5);
    const room = out[donor] - floor - 10;
    const moved = Math.min(want, room);
    if (moved <= 0) break;
    out[donor] -= moved;
    out[atFloor[k]] += moved;
  }
  /* The key stays a real share of the year. A draw can leave it in the
     teens, which reads as a broken answer rather than a hard question. */
  if (n >= 4) {
    const others = [];
    for (let i = 0; i < n; i++) if (i !== correct) others.push(i);
    while (out[correct] < 26) {
      let donor = others[0];
      for (const i of others) if (out[i] > out[donor]) donor = i;
      if (out[donor] <= floor + 1) break;
      out[donor] -= 1;
      out[correct] += 1;
    }
  }
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
