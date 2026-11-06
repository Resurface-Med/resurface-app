/*
 * A new account's way in (2026-10-26).
 *
 * Of the first 26 sign-ups, 9 never answered a question, and the 4 who had a
 * deck waiting and still stalled each left within a minute of the welcome
 * note. The note said only "Year 2 Renal is done", to Year 1 students too,
 * and its button opened the deck list rather than a question. So the note
 * now names the decks for your year ({decks} in its text, filled in here),
 * and the button starts five questions from the start of your year's first
 * deck: its opening lectures, the most basic material.
 *
 * Pure: takes what loadFeatured returns.
 */

const join = names => names.length <= 1 ? names.join("")
  : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Ready-made decks filed under "Year N", in the order they are listed. */
export function yearDecks(featured, year) {
  if (!featured || !Number.isInteger(year)) return [];
  const byId = new Map((featured.decks ?? []).map(d => [d.id, d]));
  return (featured.roots ?? [])
    .filter(r => !r.hidden && r.name === `Year ${year}` && byId.has(r.id))
    .map(r => ({ id: r.id, name: byId.get(r.id).name, byline: r.byline ?? null }));
}

/** Every year that has ready-made decks: [{ year, decks }], lowest first. */
function allYears(featured) {
  const out = [];
  for (let y = 1; y <= 6; y++) {
    const decks = yearDecks(featured, y);
    if (decks.length) out.push({ year: y, decks });
  }
  return out;
}

/**
 * The sentence that replaces {decks} in the welcome note.
 */
export function decksLine(featured, year) {
  const mine = yearDecks(featured, year);
  /* The whole first step, as plain as the second. No topics, since people
     are at different stages; and not "Your decks are ready", which read like
     a waiter (Rafil, 2026-10-26). */
  /* "deck", even with several under it: the year is one thing you open. */
  if (mine.length) return `Use the ready-made Year ${year} deck.`;
  const years = allYears(featured);
  if (!years.length) return "Use the ready-made decks, as they're added.";
  return `Use the ready-made decks. So far there are decks for ${join(years.map(y => `Year ${y.year}`))}, and we're working on the other years.`;
}

/** The note with {decks} filled in. Unchanged if the text doesn't use it. */
export function personalNote(note, featured, year) {
  if (!note || !String(note.body ?? "").includes("{decks}")) return note;
  return { ...note, body: note.body.replaceAll("{decks}", decksLine(featured, year)) };
}

/**
 * The first three questions a new account answers (2026-11-06). The welcome
 * note's button used to open the deck list, and of 11 new people who never
 * answered anything, 4 pressed it and gave up choosing decks there. Now it
 * starts these straight away. Picked from the answer log: every student got
 * each right first time, on basic material. Year 1 from Principles, Year 2
 * from Renal. Database ids; if a deck is edited and they go, the note falls
 * back to opening the deck list.
 */
export const STARTERS = {
  1: [10562, 10726, 11239],   // axial/appendicular skeleton, osmosis, codon
  2: [10056, 155, 158],       // Bowman's capsule, post-renal AKI, diabetes and AKI
};

/** The starter questions for a year that exist right now, as app ids. */
export function starterIds(year, questions, base) {
  const want = new Set((STARTERS[year] ?? []).map(id => base + id));
  return (questions ?? []).filter(q => want.has(q.id)).map(q => q.id);
}

/**
 * Where "Start practising" takes a new account: the Year N heading in Study,
 * open, so they pick the topic they're on. Not a deck chosen for them:
 * people are at different stages of their revision (Rafil, 2026-10-26).
 */
export function yearFolder(featured, year) {
  if (!featured || !Number.isInteger(year)) return null;
  const r = (featured.roots ?? []).find(x => !x.hidden && x.name === `Year ${year}`);
  return r ? (r.top ?? r.id) : null;
}


/**
 * The deck someone has got better at (2026-10-26): their first 15 answers
 * on it against their latest 15, at least 30 in all, 10 points better and
 * at 50% or more now. `shown` is what each deck was at when the card last
 * showed, so the same deck only comes back after another 10 points.
 * `deckOf(questionId)` names a question's deck. The biggest gain wins.
 */
export function improvement(answers, deckOf, shown = {}, n = 15) {
  const by = new Map();
  for (const a of answers ?? []) {
    const deck = deckOf(a.question_id);
    if (!deck) continue;
    if (!by.has(deck)) by.set(deck, []);
    by.get(deck).push(a.correct ? 1 : 0);
  }
  let best = null;
  for (const [deck, xs] of by) {
    if (xs.length < n * 2) continue;
    const pct = arr => Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100);
    const before = pct(xs.slice(0, n)), after = pct(xs.slice(-n));
    if (after - before < 10 || after < 50) continue;
    if (shown[deck] != null && after < shown[deck] + 10) continue;
    if (!best || after - before > best.after - best.before) best = { deck, before, after };
  }
  return best;
}
