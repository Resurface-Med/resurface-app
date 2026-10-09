/**
 * Deck paths.
 *
 * Separate from data/index.js because that module uses these while it is
 * still assembling, so this one must not depend on it.
 */
const SEP = "";

/** Ancestors first, the deck itself last. */
export function deckPath(deckId, decksById) {
  const out = [];
  let cur = decksById.get(deckId);
  let guard = 0;
  while (cur && guard++ < 32) {
    out.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? decksById.get(cur.parentId) : null;
  }
  return out;
}

/**
 * Your questions get their path from their deck.
 *
 * block / deck / cat are what is left of the shipped bank's fixed shape, and
 * only two of them are true at every depth: `block` is the first step of the
 * path and `cat` the last, so both are whatever you actually called those
 * decks. `deck` is the second step, or the first again when there is no
 * second — which means at one level it repeats `block`, at two it repeats
 * `cat`, and past three it names a level while the ones between it and the
 * leaf go unmentioned.
 *
 * Progress used to be built on all three and was correspondingly wrong at
 * every depth but three; it walks the decks themselves now. What still reads
 * these is the session summary, and it reads `cat`. Do not add a reader of
 * `deck` — walk `path`, which is the real thing these are flattened from.
 */
export function decorateUserQuestion(row, decksById) {
  const path = row.deckId ? deckPath(row.deckId, decksById) : [];
  if (!path.length) {
    const id = `orphan${SEP}${row.id}`;
    return {
      ...row,
      path: [{ id: "orphan", name: "Unfiled" }, { id, name: "Unfiled" }],
      leaf: id, rootId: "orphan",
      block: "Unfiled", deck: "Unfiled", cat: "Unfiled",
      year: row.year ?? "Year 1",
    };
  }
  const root = path[0];
  const leaf = path[path.length - 1];
  const mid = path.length >= 2 ? path[1] : root;
  return {
    ...row,
    path,
    leaf: leaf.id,
    rootId: root.id,
    block: root.name,
    deck: mid.name,
    cat: leaf.name,
    year: row.year ?? "Year 1",
  };
}

