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
 * The curriculum, as it is actually taught: block → subject → topic.
 *
 * A Year 1 student does Principles as a block, and inside it Biochemistry,
 * Physiology and the rest, each with its own topics. Then Respiratory, with
 * the same subjects underneath. So the block is the outer level and the
 * subjects repeat inside each one — which is why this is derived from the
 * questions rather than from the deck files: a deck file is one subject across
 * every block it appears in, and only the questions know which block each
 * question belongs to.
 *
 * CURRICULUM is [{ block, decks: [{ deck, cats: [...] }] }], in teaching order.
 */
export const CURRICULUM = [];
export const BLOCKS = [];

/* Teaching order, not alphabetical — Principles comes first because it is
   taught first, and Respiratory before Cardiovascular for the same reason.
   Anything not listed sorts after these, alphabetically, so a block nobody
   has told this file about still appears rather than disappearing. */
const BLOCK_ORDER = [
  "Principles",
  "Respiratory",
  "Cardiovascular",
  "Gastrointestinal",
];

function blockRank(name) {
  const i = BLOCK_ORDER.indexOf(name);
  return i === -1 ? BLOCK_ORDER.length : i;
}

function buildCurriculum() {
  const blocks = new Map();

  for (const q of QUESTIONS) {
    const b = q.block || "Other";
    if (!blocks.has(b)) blocks.set(b, new Map());
    const decks = blocks.get(b);
    if (!decks.has(q.deck)) decks.set(q.deck, new Set());
    decks.get(q.deck).add(q.cat);
  }

  const out = [...blocks.entries()]
    .sort((a, b) => blockRank(a[0]) - blockRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([block, decks]) => ({
      block,
      decks: [...decks.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .map(([deck, cats]) => ({ deck, cats: [...cats] })),
    }));

  CURRICULUM.push(...out);
  BLOCKS.push(...out.map(b => b.block));
}

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

    buildCurriculum();

    return { count: QUESTIONS.length, decks: decks.length, blocks: BLOCKS.length };
  })();

  return loaded;
}
