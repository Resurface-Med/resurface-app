/**
 * Paths, without importing the bank — data/index.js uses these while it
 * loads, so this file must not depend on it.
 */
export const BANK_ROOT = "bank";
export const BANK_NAME = "ARU Year 1";

const SEP = "";

/** The bank's questions get their path from block › subject › topic. */
export function decorateBankQuestion(q) {
  const b = q.block || "Other";
  const bId = `${BANK_ROOT}${SEP}${b}`;
  const dId = `${bId}${SEP}${q.deck}`;
  const cId = `${dId}${SEP}${q.cat}`;
  return {
    ...q,
    path: [
      { id: BANK_ROOT, name: BANK_NAME },
      { id: bId, name: b },
      { id: dId, name: q.deck },
      { id: cId, name: q.cat },
    ],
    leaf: cId,
    rootId: BANK_ROOT,
  };
}

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
 * Your questions get their path from their deck. The old block / deck / cat
 * fields are kept as labels — Progress and the session summary read them —
 * derived from the path: root deck, the level under it, the deck itself.
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

