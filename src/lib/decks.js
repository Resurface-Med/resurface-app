import { QUESTIONS } from "../data";

/**
 * Folders and decks.
 *
 * A deck holds questions. A folder holds decks and folders and never holds
 * questions. Both are rows you own — the app ships none. One container for
 * both jobs is what forced "sub-deck" and "top level" into the interface and
 * made every picker offer destinations that could not accept what you were
 * moving.
 *
 * A question carries the path to its deck, and a `leaf` key — the deck's id —
 * which is what Study filters on. Names are for reading; keys are for
 * matching, so two decks called "Glycolysis" never collide.
 */

export { deckPath, decorateUserQuestion } from "./deckPaths";

export function indexDecks(decks) {
  return new Map(decks.map(d => [d.id, d]));
}

/**
 * The forest: every root and what is under it, with counts. Built from the
 * questions (which carry their paths) and from the decks themselves, so a
 * deck with nothing in it yet still appears.
 *
 * Node: { id, name, children: [], total, seen, avail, mine, depth }.
 */
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Siblings in reading order: "2.9" before "2.10", A before B. */
export function sortSiblings(nodes) {
  nodes.sort((a, b) => natural.compare(a.name, b.name));
  nodes.forEach(n => sortSiblings(n.children));
  return nodes;
}

export function buildForest({ questions, decks, pStats, eligible, due = null, rootId = null }) {
  const nodes = new Map();
  const roots = [];

  function node(id, name, parentNode, mine, isFolder = false) {
    let n = nodes.get(id);
    if (!n) {
      n = { id, name, children: [], total: 0, seen: 0, avail: 0, due: 0, mine, isFolder, depth: parentNode ? parentNode.depth + 1 : 0 };
      nodes.set(id, n);
      if (parentNode) parentNode.children.push(n); else roots.push(n);
    }
    return n;
  }

  // Your decks first, in their own order, so an empty one is still there.
  const byId = indexDecks(decks);
  const sorted = [...decks].sort((a, b) => (a.position - b.position) || String(a.createdAt).localeCompare(String(b.createdAt)));
  function ensureDeck(d) {
    if (nodes.has(d.id)) return nodes.get(d.id);
    const parent = d.parentId && byId.has(d.parentId) ? ensureDeck(byId.get(d.parentId)) : null;
    return node(d.id, d.name, parent, true, Boolean(d.isFolder));
  }
  for (const d of sorted) ensureDeck(d);

  for (const q of questions) {
    if (!q.path) continue;
    let parent = null;
    for (const step of q.path) {
      parent = node(step.id, step.name, parent, Boolean(q.gen));
    }
    const isSeen = Boolean(pStats[q.id]);
    const isAvail = eligible.has(q.id);
    const isDue = due ? due.has(q.id) : false;
    for (const step of q.path) {
      const n = nodes.get(step.id);
      n.total += 1;
      if (isSeen) n.seen += 1;
      if (isAvail) n.avail += 1;
      if (isDue) n.due += 1;
    }
  }

  // Natural order within a parent.
  sortSiblings(roots);

  if (rootId) {
    const r = nodes.get(rootId);
    return r ? [r] : [];
  }
  return roots;
}

/** Every leaf id under a node (a node with no children is its own leaf). */
export function leavesUnder(n) {
  if (!n.children.length) return [n.id];
  return n.children.flatMap(leavesUnder);
}

export function findNode(forest, id) {
  for (const r of forest) {
    if (r.id === id) return r;
    const hit = findNode(r.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Everything under a node, itself included, in reading order. */
export function walk(n, out = []) {
  out.push(n);
  for (const c of n.children) walk(c, out);
  return out;
}

/** The share link for one of your decks. */
export function deckShareUrl(deck) {
  return `${window.location.origin}/d/${deck.shareCode}`;
}

export function deckCodeFromLocation() {
  const m = window.location.pathname.match(/^\/d\/([a-f0-9]{12})$/);
  return m ? m[1] : null;
}

/** The questions in a deck, or in every deck under a folder. */
export function questionsInDeck(deckId) {
  return QUESTIONS.filter(q => q.path?.some(p => p.id === deckId));
}
