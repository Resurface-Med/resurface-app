// The question bank, fetched at runtime rather than compiled into the bundle.
//
// Importing the decks as modules inlined 386KB of JSON into the main chunk,
// which every user downloaded and parsed before the app could paint — including
// the eight subjects they weren't about to study. Serving them from public/
// means the browser can cache them separately from the code, and a deploy that
// changes only the app doesn't invalidate them.
//
// These are exported as living objects that fill in once, not as values. Every
// consumer reads them during render, after loadDecks() has resolved, so nothing
// observes them empty — see the loading gate in App.jsx.

export const QUESTIONS = [];
export const DECK_MAP = {};

/**
 * Where a user's own question ids start.
 *
 * Questions you write or generate live in their own table, whose ids restart
 * at 1 — the same range the deck files already use (1–510). Progress, SR cards
 * and bookmarks are all keyed on a bare question id, so if the two sets shared
 * numbers, answering your own question #2 would record against bank question
 * #2. The offset is added once, where the rows are read, and taken off once,
 * where a row is deleted.
 */
export const GEN_ID_BASE = 1_000_000;

/*
 * CURRICULUM and BLOCKS used to live here: block → subject → topic, derived
 * from three fields manufactured on every question. That was the shipped
 * bank's shape, which was always exactly three levels. Progress read them and
 * so was only correct at exactly three — one level repeated a name three
 * times, four dropped the middle one. It walks the decks themselves now, and
 * nothing else ever read these, so they are gone rather than kept correct.
 */

/* Two sources, one pool. Deck questions arrive once; yours arrive after
   sign-in and change whenever you add or delete one, so QUESTIONS is rebuilt
   from both rather than appended to — appending would have to assume where in
   the array the previous set ended. */
const deckQs = [];
let userQs = [];

/* Your corrections, keyed on question id. A correction is a whole replacement
   of the answerable part of a question — stem, options, answer, explanations,
   image — not a diff, so it is spread over the original wholesale. Options and
   answer index have to travel together or the answer would point at the wrong
   option, which is exactly why the edit form saves them as one payload.

   Applied over a pristine deckQs rather than into it, so editing the same
   question twice starts from the original both times. */
let edits = {};

function withEdits(q) {
  const e = edits[q.id];
  return e ? { ...q, ...e } : q;
}

function syncQuestions() {
  QUESTIONS.length = 0;
  for (const q of deckQs) QUESTIONS.push(withEdits(q));
  for (const q of userQs) QUESTIONS.push(withEdits(q));
}

/** The whole set, as loaded on sign-in. */
export function setQuestionEdits(map) {
  edits = map ?? {};
  syncQuestions();
}

/**
 * One correction, as it is made.
 *
 * Deliberately not routed through React state: the screen showing the question
 * patches its own copy so the change is visible immediately, and every other
 * screen is remounted by the view switch before it can read a stale pool. The
 * point of this call is that the correction is still there after that switch,
 * which is what it was not doing before.
 */
export function applyQuestionEdit(id, payload) {
  edits = { ...edits, [id]: payload };
  syncQuestions();
}

/**
 * Puts the signed-in user's own questions into the bank.
 *
 * Called with the full set every time, not a delta. A question that never
 * reached the database has no stable id and so cannot carry progress; it stays
 * listed in Generate and joins the study pool on the next load, once its
 * queued write has gone through.
 */
export function setUserQuestions(rows) {
  userQs = (rows ?? []).filter(q => typeof q.id === "number");
  syncQuestions();
}

let loaded = null;

/** Idempotent: repeated calls return the same in-flight or settled promise. */
export function loadDecks() {
  if (loaded) return loaded;

  /*
   * Nothing to load any more.
   *
   * The app used to ship a bank of 506 questions and fetch it on sign-in.
   * It is your own material now — what you upload is the whole product —
   * so there is no shared bank to pull down, and `deckQs` stays empty while
   * `userQs` carries everything.
   *
   * The function survives rather than its callers being unpicked: App.jsx
   * gates its first render on this resolving, and that gate is also what
   * makes sure nothing reads QUESTIONS before the user's own rows have
   * landed. It is the shape, not the fetch, that was load-bearing.
   */
  loaded = (async () => {
    syncQuestions();
    return { count: QUESTIONS.length, decks: 0 };
  })();

  return loaded;
}
