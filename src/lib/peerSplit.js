/*
 * How the cohort split on a question.
 *
 * Once PEER_MIN distinct people have answered, the percentages are theirs.
 * Before that, the split is read off the question itself: a wrong option
 * that is almost the right one takes a real share, and an unrelated one
 * does not. Two options never land on the same number. option_split
 * returns nothing until the tally is large enough, so a thin sample never
 * reaches the screen. Keep PEER_MIN in step with that function.
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

const STOP = new Set("a an the of in on to for with from by and or its is are which what that into over".split(" "));

function words(s) {
  const raw = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(w => w && !STOP.has(w));
  const kept = raw.filter(w => w.length > 2);
  return kept.length ? kept : raw.slice(0, 4);
}

/* Words that sit on every option ("cells") do not make two answers alike.
   What is left is the choice the question is actually asking. */
function distinctive(opts) {
  const docs = opts.map(words);
  const df = new Map();
  for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) || 0) + 1);
  return docs.map(doc => doc.filter(w => (df.get(w) || 0) < docs.length));
}

function likeness(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter += 1;
  const dice = (2 * inter) / (setA.size + setB.size);
  const tail = a[a.length - 1] === b[b.length - 1] ? 0.2 : 0;
  return Math.min(1, dice + tail);
}

function settle(out, floor) {
  for (let guard = 0; guard < out.length * 4; guard++) {
    const low = out.findIndex(v => v < floor);
    if (low < 0) return out;
    let donor = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[donor]) donor = i;
    const moved = Math.min(floor - out[low], out[donor] - floor);
    if (moved <= 0) break;
    out[donor] -= moved;
    out[low] += moved;
  }
  return out;
}

/* The one you picked and the right one sitting on 40 and 40 is the tell.
   Walk the later copy onto the next free percent. */
function untie(out, floor, correct) {
  for (let guard = 0; guard < out.length * 12; guard++) {
    const seen = new Map();
    let dup = -1;
    for (let i = 0; i < out.length; i++) {
      if (seen.has(out[i])) { dup = i; break; }
      seen.set(out[i], i);
    }
    if (dup < 0) return out;
    let donor = -1;
    for (let i = 0; i < out.length; i++) {
      if (i === dup || i === correct || out[i] <= floor) continue;
      if (donor < 0 || out[i] > out[donor]) donor = i;
    }
    if (donor < 0 && correct !== dup && out[correct] > floor) donor = correct;
    if (donor < 0) break;
    const taken = new Set(out.filter((_, i) => i !== dup));
    let next = out[dup] + 1;
    while (taken.has(next)) next += 1;
    const moved = Math.min(next - out[dup], out[donor] - floor);
    if (moved <= 0) break;
    out[donor] -= moved;
    out[dup] += moved;
  }
  return out;
}

function standIn(id, opts, correct, stem) {
  const n = opts.length;
  if (n <= 0) return [];
  if (n === 1) return [100];
  const docs = distinctive(opts);
  const stemWords = new Set(words(stem));
  const pulls = docs.map((doc, i) => {
    if (i === correct) return -1;
    const twin = likeness(doc, docs[correct]);
    const borrowed = doc.some(w => stemWords.has(w) && !docs[correct].includes(w));
    return Math.min(1, twin + (borrowed ? 0.12 : 0));
  });
  const ranked = pulls
    .map((p, i) => ({ p, i }))
    .filter(x => x.i !== correct)
    .sort((a, b) => b.p - a.p || a.i - b.i);
  const top = ranked[0]?.p ?? 0;
  const floor = n <= 2 ? 28 : n === 3 ? 8 : 5;
  const spare = 100 - floor * n;
  const above = top >= 0.55 ? 18 + (hashId(id) % 5)
    : top >= 0.32 ? 11 + (hashId(id) % 3)
    : 6 + (hashId(id) % 3);
  /* Floors are already on every option. The spare goes to the key, after
     a near miss has taken its crowd and a second one in the same family
     has taken a smaller crowd behind it. */
  const out = Array(n).fill(floor);
  let left = spare;
  const keep = Math.min(30, Math.max(0, spare - above));
  ranked.forEach((item, k) => {
    let give = 0;
    if (k === 0) give = Math.min(above, Math.max(0, left - keep));
    else if (item.p >= 0.45) give = Math.min(Math.max(4, above - 10), Math.max(0, left - keep));
    if (give > 0) {
      out[item.i] += give;
      left -= give;
    }
  });
  out[correct] += left;
  const drift = 100 - out.reduce((a, b) => a + b, 0);
  out[correct] += drift;
  if (ranked[0] && out[correct] - out[ranked[0].i] < 8 && out[ranked[0].i] - 8 >= floor) {
    const need = 8 - (out[correct] - out[ranked[0].i]);
    out[ranked[0].i] -= need;
    out[correct] += need;
  }
  settle(out, floor);
  return untie(out, floor, correct);
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
 * that tally isn't being used. `opts` and `stem` are the question, so
 * the stand-in can follow how hard the choice actually is.
 */
export function peerPercents(questionId, n, correctIndex, counts, opts, stem) {
  if (Array.isArray(counts)) {
    const total = counts.reduce((a, b) => a + (Number(b) || 0), 0);
    if (total >= PEER_MIN) return fromCounts(counts, n);
  }
  const correct = Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < n
    ? correctIndex
    : 0;
  const texts = Array.isArray(opts) && opts.length === n
    ? opts
    : Array.from({ length: n }, (_, i) => `option ${i}`);
  return standIn(questionId, texts, correct, stem || "");
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
  const texts = Array.isArray(liveOpts) && liveOpts.length === n
    ? liveOpts
    : (() => {
        if (!order) return q.opts;
        const canon = Array(n);
        for (let i = 0; i < n; i++) canon[order[i]] = q.opts[i];
        return canon;
      })();
  const base = peerPercents(q.id, n, correct, Array.isArray(counts) ? counts : null, texts, q.q);
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
