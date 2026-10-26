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
  /* Just that, not the names or who made them: shorter and cleaner
     (Rafil, 2026-10-26). The button names the deck it starts. */
  if (mine.length) return `Your Year ${year} ${mine.length === 1 ? "deck is" : "decks are"} ready.`;
  const years = allYears(featured);
  if (!years.length) return "We're putting the first ones together now.";
  const list = join(years.map(y => `Year ${y.year} (${join(y.decks.map(d => d.name))})`));
  return `So far there are decks for ${list}, and we're working on the other years.`;
}

/** The note with {decks} filled in. Unchanged if the text doesn't use it. */
export function personalNote(note, featured, year) {
  if (!note || !String(note.body ?? "").includes("{decks}")) return note;
  return { ...note, body: note.body.replaceAll("{decks}", decksLine(featured, year)) };
}

/**
 * The first `n` question ids of a ready-made deck, walking its decks in the
 * order they are listed and taking the first ones that have questions.
 */
export function firstQuestionIds(featured, rootId, n = 5) {
  const kids = new Map();
  for (const d of featured?.decks ?? []) {
    if (!d.parentId) continue;
    if (!kids.has(d.parentId)) kids.set(d.parentId, []);
    kids.get(d.parentId).push(d);
  }
  for (const list of kids.values()) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const byDeck = new Map();
  for (const q of featured?.questions ?? []) {
    if (!byDeck.has(q.deckId)) byDeck.set(q.deckId, []);
    byDeck.get(q.deckId).push(q.id);
  }
  const out = [];
  const walk = id => {
    if (out.length >= n) return;
    for (const qid of byDeck.get(id) ?? []) { if (out.length >= n) return; out.push(qid); }
    for (const c of kids.get(id) ?? []) walk(c.id);
  };
  walk(rootId);
  return out;
}

/** The deck a new account starts on, with its first questions, or null. */
export function starterFor(featured, year, n = 5) {
  for (const d of yearDecks(featured, year)) {
    const ids = firstQuestionIds(featured, d.id, n);
    if (ids.length) return { name: d.name, ids };
  }
  return null;
}
