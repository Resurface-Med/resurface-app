import { QUESTIONS } from "../data";

/**
 * Decks: the one container.
 *
 * A deck holds questions and can hold decks. The bank ships as a read-only
 * deck, "ARU Year 1", whose sub-decks are its blocks, subjects and topics;
 * every deck of yours is a real row you own. A question carries the path
 * to its deck, and a `leaf` key — the deck's id — which is what Study
 * filters on. Names are for reading; keys are for matching, so two decks
 * called "Glycolysis" never collide.
 */

export { BANK_ROOT, BANK_NAME, decorateBankQuestion, deckPath, decorateUserQuestion } from "./deckPaths";
import { BANK_ROOT } from "./deckPaths";

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
export function buildForest({ questions, decks, pStats, eligible, rootId = null }) {
  const nodes = new Map();
  const roots = [];

  function node(id, name, parentNode, mine) {
    let n = nodes.get(id);
    if (!n) {
      n = { id, name, children: [], total: 0, seen: 0, avail: 0, mine, depth: parentNode ? parentNode.depth + 1 : 0 };
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
    return node(d.id, d.name, parent, true);
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
    for (const step of q.path) {
      const n = nodes.get(step.id);
      n.total += 1;
      if (isSeen) n.seen += 1;
      if (isAvail) n.avail += 1;
    }
  }

  // The bank last, so your own decks lead.
  roots.sort((a, b) => (a.id === BANK_ROOT) - (b.id === BANK_ROOT));

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

/** The questions in a deck, including its sub-decks. */
export function questionsInDeck(deckId) {
  return QUESTIONS.filter(q => q.path?.some(p => p.id === deckId));
}
