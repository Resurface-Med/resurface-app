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
 * Where "Start practising" takes a new account: the Year N heading in Study,
 * open, so they pick the topic they're on. Not a deck chosen for them:
 * people are at different stages of their revision (Rafil, 2026-10-26).
 */
export function yearFolder(featured, year) {
  if (!featured || !Number.isInteger(year)) return null;
  const r = (featured.roots ?? []).find(x => !x.hidden && x.name === `Year ${year}`);
  return r ? (r.top ?? r.id) : null;
}
