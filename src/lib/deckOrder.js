/**
 * Where decks sit among their siblings, and where a drag would put one.
 *
 * Everything here is pure, so it can be tested without a browser. The last
 * four goes at dragging were lost inside event handlers, where a wrong answer
 * and no answer look the same; these functions can just be asked.
 *
 * Order is manual: `position` is a sparse integer, spaced STEP apart, so a
 * move almost always writes one row — the moved deck, at the midpoint of its
 * new neighbours — and siblings are only renumbered when two have run out of
 * room between them.
 */

export const STEP = 1024;

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Sibling order: position, then name, then age, so ties are still stable. */
export function compareDecks(a, b) {
  return ((a.position ?? 0) - (b.position ?? 0))
    || natural.compare(a.name ?? "", b.name ?? "")
    || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
}

const parentOf = d => d.parentId ?? null;

function siblingsOf(decks, parentId, exceptId = null) {
  return decks.filter(d => parentOf(d) === parentId && d.id !== exceptId).sort(compareDecks);
}

/** Whether `id` is `ancestorId` or somewhere beneath it. */
export function isWithin(decks, id, ancestorId) {
  const byId = new Map(decks.map(d => [d.id, d]));
  for (let p = id, guard = 0; p && guard < 1000; guard++) {
    if (p === ancestorId) return true;
    p = parentOf(byId.get(p) ?? {});
  }
  return false;
}

/** The position for a deck added at the end of a parent. */
export function nextPosition(decks, parentId = null) {
  const sibs = siblingsOf(decks, parentId);
  return sibs.length ? Math.max(...sibs.map(d => d.position ?? 0)) + STEP : STEP;
}

/**
 * Put deck `id` under `parentId` (null: the top level), just before sibling
 * `beforeId` (null: at the end).
 *
 * Returns { decks, changes } — the new rows, and the patches to write — or
 * null when the move is impossible (into itself or beneath itself). A move
 * that changes nothing returns no changes.
 */
export function moveDeckTo(decks, id, parentId = null, beforeId = null) {
  const moving = decks.find(d => d.id === id);
  if (!moving) return null;
  if (parentId !== null && isWithin(decks, parentId, id)) return null;

  const sibs = siblingsOf(decks, parentId, id);
  let at = beforeId ? sibs.findIndex(s => s.id === beforeId) : sibs.length;
  if (at < 0) at = sibs.length;

  /* Already there: same parent, and the same neighbours either side. */
  if (parentOf(moving) === parentId) {
    const current = siblingsOf(decks, parentId);
    if (current.findIndex(d => d.id === id) === at) return { decks, changes: [] };
  }

  const prev = sibs[at - 1], next = sibs[at];
  let pos = null;
  if (!prev && !next) pos = STEP;
  else if (!prev) pos = (next.position ?? 0) - STEP;
  else if (!next) pos = (prev.position ?? 0) + STEP;
  else if ((next.position ?? 0) - (prev.position ?? 0) >= 2) pos = Math.floor(((prev.position ?? 0) + (next.position ?? 0)) / 2);

  const patches = new Map();
  if (pos !== null) {
    patches.set(id, { parent_id: parentId, position: pos });
  } else {
    /* No room between the neighbours (or they tie): renumber the parent. */
    const ordered = [...sibs];
    ordered.splice(at, 0, moving);
    ordered.forEach((d, i) => {
      const p = (i + 1) * STEP;
      if (d.id === id) patches.set(id, { parent_id: parentId, position: p });
      else if (d.position !== p) patches.set(d.id, { position: p });
    });
  }

  const next_ = decks.map(d => {
    const p = patches.get(d.id);
    if (!p) return d;
    return { ...d, position: p.position, ...("parent_id" in p ? { parentId: p.parent_id } : {}) };
  });
  return { decks: next_, changes: [...patches].map(([deckId, patch]) => ({ id: deckId, patch })) };
}

/* ── The tree as it is drawn ───────────────────────────────────────── */

/** Where a forest node sits: { parentId, siblings } (siblings in order). */
export function placeOf(forest, id, rootParentId = null) {
  let found = null;
  (function walk(nodes, parentId) {
    for (const n of nodes) {
      if (found) return;
      if (n.id === id) { found = { parentId, siblings: nodes }; return; }
      walk(n.children, n.id);
    }
  })(forest, rootParentId);
  return found;
}

/**
 * The one-step moves, as { parentId, beforeId } or null when there is
 * nowhere to go: up and down among siblings, in (into the deck above, at its
 * end), and out (beside its parent, just after it). `floor` is the parent a
 * deck may not leave — the open tab, on phones.
 */
export function stepMove(forest, id, dir, floor = null) {
  const here = placeOf(forest, id, floor);
  if (!here) return null;
  const sibs = here.siblings;
  const i = sibs.findIndex(n => n.id === id);
  if (dir === "up") return i > 0 ? { parentId: here.parentId, beforeId: sibs[i - 1].id } : null;
  if (dir === "down") return i < sibs.length - 1 ? { parentId: here.parentId, beforeId: sibs[i + 2]?.id ?? null } : null;
  if (dir === "in") return i > 0 ? { parentId: sibs[i - 1].id, beforeId: null } : null;
  if (dir === "out") {
    if (here.parentId === floor) return null;
    const up = placeOf(forest, here.parentId, floor);
    if (!up) return null;
    const j = up.siblings.findIndex(n => n.id === here.parentId);
    return { parentId: up.parentId, beforeId: up.siblings[j + 1]?.id ?? null };
  }
  return null;
}

/**
 * The rows a drag can land between, top to bottom: what is on screen, minus
 * the deck being dragged and everything under it.
 *
 * Row: { id, depth, parentId, isOpen } — isOpen when its children are drawn.
 * A deck whose only child is the one being dragged still counts as open, so
 * the gap can sit inside it: that is where the drag started.
 */
export function visibleRows(forest, open, { excludeId = null, rootParentId = null } = {}) {
  const rows = [];
  (function walk(nodes, parentId) {
    for (const n of nodes) {
      if (n.id === excludeId) continue;
      const kids = n.children.filter(k => k.id !== excludeId);
      const isOpen = open.has(n.id) && n.children.length > 0;
      rows.push({ id: n.id, depth: n.depth, parentId, isOpen });
      if (isOpen) walk(kids, n.id);
    }
  })(forest, rootParentId);
  return rows;
}

/**
 * Where a gap at index `g` (between rows[g-1] and rows[g]) lands, at the
 * depth nearest `wantDepth` that the rows either side allow.
 *
 * Below an open deck the gap can only be its first child. Below the last
 * deck in a run, it can be at any depth from the row after it up to the row
 * before it — which is how a deck is dragged out of the one it was in.
 *
 * Returns { g, depth, parentId, beforeId }.
 */
export function projectGap(rows, g, wantDepth, base = 0, rootParentId = null) {
  g = Math.max(0, Math.min(rows.length, g));
  const P = rows[g - 1], N = rows[g];
  const lo = N ? N.depth : base;
  const hi = Math.max(lo, P ? (P.isOpen ? P.depth + 1 : P.depth) : base);
  const depth = Math.max(lo, Math.min(hi, Math.round(wantDepth)));

  let parentId;
  if (!P || depth === base) parentId = rootParentId;
  else if (depth === P.depth + 1) parentId = P.id;
  else {
    const byId = new Map(rows.map(r => [r.id, r]));
    let a = P;
    while (a && a.depth > depth) a = byId.get(a.parentId);
    parentId = a ? a.parentId : rootParentId;
  }
  const beforeId = N && N.depth === depth ? N.id : null;
  return { g, depth, parentId, beforeId };
}

/** The gap that leaves a deck exactly where it is — where a drag starts. */
export function homeGap(forest, open, id, rootParentId = null) {
  const all = visibleRows(forest, open, { rootParentId });
  const at = all.findIndex(r => r.id === id);
  if (at < 0) return null;
  const rows = visibleRows(forest, open, { excludeId: id, rootParentId });
  const base = all.length ? Math.min(...all.map(r => r.depth)) : 0;
  return projectGap(rows, at, all[at].depth, base, rootParentId);
}

/** Whether two landing places are the same. */
export function sameSpot(a, b) {
  return Boolean(a && b) && a.parentId === b.parentId && a.beforeId === b.beforeId;
}
