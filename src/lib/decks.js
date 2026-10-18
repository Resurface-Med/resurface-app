import { QUESTIONS } from "../data";
import { compareDecks } from "./deckOrder";

/**
 * Decks: the one container.
 *
 * A deck holds questions and can hold decks, and every one is a row you
 * own — the app ships none. A question carries the path
 * to its deck, and a `leaf` key — the deck's id — which is what Study
 * filters on. Names are for reading; keys are for matching, so two decks
 * called "Glycolysis" never collide.
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
/** Siblings in the order you put them in (see lib/deckOrder.js). */
function orderSiblings(nodes, byId) {
  nodes.sort((a, b) => compareDecks(byId.get(a.id) ?? a, byId.get(b.id) ?? b));
  nodes.forEach(n => orderSiblings(n.children, byId));
  return nodes;
}

export function buildForest({ questions, decks, pStats, eligible, due = null, rootId = null }) {
  const nodes = new Map();
  const roots = [];

  function node(id, name, parentNode, mine) {
    let n = nodes.get(id);
    if (!n) {
      n = { id, name, children: [], total: 0, seen: 0, avail: 0, due: 0, mine, depth: parentNode ? parentNode.depth + 1 : 0 };
      nodes.set(id, n);
      if (parentNode) parentNode.children.push(n); else roots.push(n);
    }
    return n;
  }

  // Your decks first, in their own order, so an empty one is still there.
  const byId = indexDecks(decks);
  const sorted = [...decks].sort(compareDecks);
  function ensureDeck(d) {
    if (nodes.has(d.id)) return nodes.get(d.id);
    const parent = d.parentId && byId.has(d.parentId) ? ensureDeck(byId.get(d.parentId)) : null;
    /* A featured deck (someone else's, read live) is drawn like yours but
       is not yours: no menu of yours, no dragging, and its byline. */
    const n = node(d.id, d.name, parent, !d.featured);
    if (d.featured) { n.featured = true; n.byline = d.byline ?? null; }
    return n;
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

  /* Manual order within a parent. Sorted after building rather than relied on
     from insertion, because a child seen first inserts its parent early. */
  orderSiblings(roots, byId);

  if (rootId) {
    const r = nodes.get(rootId);
    return r ? [r] : [];
  }
  return roots;
}

/**
 * Whether a deck may be dropped onto another.
 *
 * A null target is the top level, which anything may go to. Nothing may go
 * into itself or into anything beneath it: the database refuses a cycle, so
 * allowing the drop would only produce an error.
 *
 * Here rather than in the component so it can be tested without a browser —
 * three attempts at this were lost inside drag events where a wrong answer
 * looks exactly like no answer at all.
 */
export function canDropDeck(forest, fromId, targetId) {
  if (!fromId || fromId === targetId) return false;
  if (targetId === null) return true;
  let inSubtree = false;
  (function walk(nodes, inside) {
    for (const x of nodes) {
      const within = inside || x.id === fromId;
      if (within && x.id === targetId) inSubtree = true;
      walk(x.children, within);
    }
  })(forest, false);
  return !inSubtree;
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
