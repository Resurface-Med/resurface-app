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

let loaded = null;

/** Idempotent: repeated calls return the same in-flight or settled promise. */
export function loadDecks() {
  if (loaded) return loaded;

  loaded = (async () => {
    const manifest = await fetch("/decks/index.json").then(r => r.json());

    const decks = await Promise.all(
      manifest.map(entry => fetch(`/decks/${entry.file}`).then(r => r.json())),
    );

    for (const deck of decks) {
      QUESTIONS.push(...deck.questions);
      DECK_MAP[deck.deck] = deck.categories;
    }

    return { count: QUESTIONS.length, decks: decks.length };
  })();

  return loaded;
}
