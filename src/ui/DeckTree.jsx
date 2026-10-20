import { useEffect, useMemo, useState, useRef, useCallback, useLayoutEffect } from "react";
import { C } from "./theme";
import Popover, { MenuItems } from "./Popover";
import MoveToPicker from "./MoveToPicker";
import { leavesUnder, findNode } from "../lib/decks";
import { stepMove, placeOf } from "../lib/deckOrder";
import { useFlip, useDeckDrag } from "./useDeckDrag";

/**
 * The deck tree: what you are revising.
 *
 * One component for any depth: your decks are however deep you made them.
 * Tick a row to
 * practise everything under it — a parent is on when all its leaves are,
 * mixed when some are. Rows carry a coverage bar and a count, and a
 * chevron where there is more underneath. A deck of yours also carries a
 * small menu at the end of its row: rename, delete, add to it.
 *
 * Selection is a Set of leaf ids, or null for everything shown.
 */

function Figure({ n, unit, className, title }) {
  return (
    <span className={className} title={title}>
      <span className="topic-count__n">{n}</span>
      <span className="topic-count__unit">{unit}</span>
    </span>
  );
}

function Coverage({ seen, total, avail, due = 0, dim, empty = false }) {
  const pct = total > 0 ? Math.min(100, Math.round((seen / total) * 100)) : 0;
  return (
    <span className="topic-meta" style={{ opacity: dim ? 0.45 : 1 }}>
      {due > 0 && <Figure className="topic-due" n={due} unit="to review" title={`${due} due for review`} />}
      <span className="topic-bar" role="img" aria-label={`${seen} of ${total} seen`}>
        <span className="topic-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      {total === 0 && empty
        ? <span className="topic-avail">empty</span>
        : <Figure className="topic-avail" n={avail} unit={avail === 1 ? "question" : "questions"} />}
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"
      style={{ display: "block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
      <path d="M6.5 3.5L12 9l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check({ state }) {
  return (
    <span className={`topic-check${state === true ? " is-on" : state === "mixed" ? " is-mixed" : ""}`} aria-hidden="true">
      {state === true && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.4L4.6 9 10 3.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "mixed" && <span className="topic-check-dash" />}
    </span>
  );
}

/**
 * A deck's name, editable where it sits. Enter or clicking away saves, Esc
 * puts it back; an empty or unchanged name saves nothing.
 */
function RenameField({ initial, onDone }) {
  const [v, setV] = useState(initial);
  const ref = useRef(null);
  const done = useRef(false);
  useLayoutEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  function finish(save) {
    if (done.current) return;
    done.current = true;
    const n = v.trim();
    onDone(save && n && n !== initial ? n : null);
  }
  return (
    <input
      ref={ref}
      className="topic-rename"
      value={v}
      maxLength={80}
      aria-label="Deck name"
      onChange={e => setV(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
      }}
      onBlur={() => finish(true)}
      onClick={e => e.stopPropagation()}
    />
  );
}

/** A row's own menu. Only your decks have one. An item marked `picker`
    swaps the menu for the Move to… list, anchored to the same ⋯. */
function RowMenu({ node, items, renderPicker }) {
  const [mode, setMode] = useState(null);           // null | "menu" | "picker"
  const ref = useRef(null);
  const close = useCallback(() => setMode(null), []);
  return (
    <span className="deck-menu">
      <button ref={ref} type="button" className="deck-menu-btn" aria-label={`Options for ${node.name}`} aria-haspopup="menu" aria-expanded={mode !== null}
        onClick={e => { e.stopPropagation(); setMode(m => (m ? null : "menu")); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.25" cy="8" r="1.2" fill="currentColor" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="12.75" cy="8" r="1.2" fill="currentColor" />
        </svg>
      </button>
      <Popover anchorRef={ref} open={mode === "menu"} onClose={close}>
        <MenuItems items={items} onPick={it => {
          if (it.picker) { setMode("picker"); return; }
          setMode(null);
          it.onSelect(node, ref.current);
        }} />
      </Popover>
      {renderPicker && (
        <Popover anchorRef={ref} open={mode === "picker"} onClose={close} className="pop-wide">
          {renderPicker(close)}
        </Popover>
      )}
    </span>
  );
}

/* A name with the searched-for text marked (2026-10-20): search keeps the
   decks above a match for context, and this is what says which row is the
   match, and where in it. Every occurrence, ignoring case. */
function Marked({ text, q }) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out = [];
  let i = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={at} className="deck-hit">{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  if (!out.length) return text;
  if (i < text.length) out.push(text.slice(i));
  return out;
}

/** Prune to rows matching the query, keeping the ancestors above a match. */
export function prune(nodes, q) {
  return nodes.flatMap(n => {
    if (n.name.toLowerCase().includes(q)) return [n];
    const kids = prune(n.children, q);
    return kids.length ? [{ ...n, children: kids }] : [];
  });
}

export default function DeckTree({
  forest, value, onChange, query = "",
  allLabel = "Everything", showAll = true, allAvail = null,
  rowMenu = null, allowEmpty = false,
  /* When another tree sits beside this one (featured decks), its matches
     count too, so this one does not say "no deck matches" over them. */
  quietNoMatch = false,
  /* A section heading over the rows ("Your decks"), under Everything. */
  heading = null,
  /* onMove(id, parentId, beforeId): drag, Alt+arrows, and the row menu's
     Move to… all end here. Without it the tree is
     read-only. */
  onMove = null,
  /* The whole tree, when `forest` is only part of it (a tab, on phones), so
     Move to… can offer every deck; and the deck that part hangs from. */
  allForest = null,
  rootParentId = null,
  /* The deck being renamed, edited in its own row; onRename(id, name) with
     null for a cancel. */
  renamingId = null,
  onRename = null,
}) {
  const q = query.trim().toLowerCase();
  const tree = useMemo(() => (q ? prune(forest, q) : forest), [forest, q]);
  /* Depth is measured from the shallowest row shown, so a tab's contents
     read like a tree of their own rather than as indented leftovers. */
  const base = useMemo(() => (forest.length ? Math.min(...forest.map(r => r.depth)) : 0), [forest]);

  const selected = useMemo(() => {
    const leaves = value.leaves ?? ["All"];
    return leaves.includes("All") || leaves.length === 0 ? null : new Set(leaves);
  }, [value.leaves]);

  /* Summing the rows shown is right when there are rows. A deck with no
     sub-decks has none — it holds its questions itself — and summing an empty
     list gave "All of Upper Renal Tract 0" above a blank list, for a deck with
     fifteen questions in it. The caller passes the figure for the thing the
     row actually names. */
  const totalAvail = useMemo(
    () => (allAvail != null ? allAvail : forest.reduce((n, r) => n + r.avail, 0)),
    [forest, allAvail],
  );

  /* Open: the first root and the branch holding the first chosen leaf. A
     scoped tree (one root) opens fully — it is small. */
  const [open, setOpen] = useState(() => {
    const s = new Set();
    const size = (function count(nodes) { return nodes.reduce((n, x) => n + 1 + count(x.children), 0); })(forest);
    if (size <= 40) {
      (function walk(nodes) { for (const n of nodes) { s.add(n.id); walk(n.children); } })(forest);
      return s;
    }
    if (forest[0]) s.add(forest[0].id);
    const first = (value.leaves ?? []).find(l => l && l !== "All");
    if (first) {
      (function find(nodes, trail) {
        for (const n of nodes) {
          if (n.id === first) { trail.forEach(id => s.add(id)); return true; }
          if (find(n.children, [...trail, n.id])) return true;
        }
        return false;
      })(forest, []);
    }
    return s;
  });

  /* A deck being named — a new one included — is shown: every deck above
     it opens, so the row with the field is on screen. */
  useEffect(() => {
    if (!renamingId) return;
    const trail = [];
    (function find(nodes, path) {
      for (const n of nodes) {
        if (n.id === renamingId) { trail.push(...path); return true; }
        if (find(n.children, [...path, n.id])) return true;
      }
      return false;
    })(forest, []);
    if (trail.length) setOpen(prev => { const next = new Set(prev); trail.forEach(id => next.add(id)); return next; });
  }, [renamingId, forest]);
  function toggleOpen(id) {
    setOpen(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  /* Unticking the last deck leaves nothing chosen, not everything — the
     list starts empty and Everything is its own box (2026-10-18). "none" is
     the empty marker, never a deck (see PracticeMode's NONE). */
  function emit(next) {
    const ids = [...(next ?? [])].filter(id => id !== "none");
    onChange({ leaves: ids.length ? ids : ["none"] });
  }
  function pickAll() { onChange({ leaves: ["All"] }); }

  function availableLeaves(n) {
    const ids = [];
    (function walk(x) {
      if (!x.children.length) { if (x.avail > 0) ids.push(x.id); return; }
      x.children.forEach(walk);
    })(n);
    return ids;
  }
  function toggleNode(n) {
    const ids = availableLeaves(n);
    if (!ids.length) return;
    const next = new Set(selected ?? []);
    const allOn = ids.every(id => next.has(id));
    ids.forEach(id => (allOn ? next.delete(id) : next.add(id)));
    emit(next);
  }
  function state(n) {
    if (!selected) return false;
    const ids = leavesUnder(n);
    const on = ids.filter(id => selected.has(id)).length;
    if (on === 0) return false;
    return on === ids.length ? true : "mixed";
  }

  const isAll = selected === null;

  const STEP = 26, PAD = 14;

  /* ── Moving decks ─────────────────────────────────────────────── */

  const containerRef = useRef(null);
  const flip = useFlip(containerRef);
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const canMove = Boolean(onMove) && !q;
  const drag = useDeckDrag({
    containerRef, flip, forest, open, setOpen, base, rootParentId,
    enabled: canMove, indentPx: coarse ? 24 : STEP,
    onMove: (id, parentId, beforeId) => { onMove(id, parentId, beforeId); announceMove(id, parentId); },
  });
  const view = drag.view;
  const shownOpen = view ? view.open : open;
  const everything = allForest ?? forest;

  const [said, setSaid] = useState("");
  function nameOf(id) { return findNode(everything, id)?.name ?? ""; }
  function announceMove(id, parentId) {
    setSaid(`Moved ${nameOf(id)} ${parentId === rootParentId || parentId === null ? "to the top" : `into ${nameOf(parentId)}`}.`);
  }

  /* After a keyboard move the row may have remounted under a new parent,
     taking focus with it; put it back on the same deck. */
  const focusAfter = useRef(null);
  useLayoutEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    containerRef.current?.querySelector(`[data-deck-id="${CSS.escape(id)}"] .topic-hit`)?.focus();
  });

  function moveNow(id, to) {
    if (!to) return false;
    flip.snapshot();
    onMove(id, to.parentId, to.beforeId);
    if (to.parentId && to.parentId !== rootParentId) {
      setOpen(prev => { const next = new Set(prev); next.add(to.parentId); return next; });
    }
    announceMove(id, to.parentId);
    return true;
  }

  const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowRight: "in", ArrowLeft: "out" };
  function onRowKey(e, n) {
    if (!canMove || !n.mine || !e.altKey || !KEYS[e.key]) return;
    e.preventDefault();
    if (moveNow(n.id, stepMove(forest, n.id, KEYS[e.key], rootParentId))) focusAfter.current = n.id;
  }

  /* The menu: the caller's items, with Move to… before the dangerous one.
     Move up / Move down were here too and were cut (2026-10-15): dragging
     and Alt+arrows already do one step, and they were menu clutter. */
  function menuFor(n) {
    /* Your decks, and a featured deck's own row (to hide it). */
    const items = rowMenu && (n.mine || n.byline) ? rowMenu(n) : null;
    if (!items || !onMove || !n.mine) return items;
    const moves = [{ label: "Move to…", picker: true }];
    const at = items.findIndex(it => it.danger);
    return at < 0 ? [...items, ...moves] : [...items.slice(0, at), ...moves, ...items.slice(at)];
  }
  function pickerFor(n) {
    if (!onMove) return null;
    const here = placeOf(everything, n.id)?.parentId ?? null;
    return close => (
      <MoveToPicker
        forest={everything}
        node={n}
        currentParentId={here}
        onPick={parentId => {
          close();
          if (parentId === here) return;
          moveNow(n.id, { parentId, beforeId: null });
          if (parentId) setOpen(prev => { const next = new Set(prev); placeOf(everything, parentId) && next.add(parentId); return next; });
        }}
      />
    );
  }

  /* The tree as drawn while dragging: the dragged deck still in its place
     (hidden — see useDeckDrag), and a gap where it would land. */
  const shown = useMemo(() => {
    if (!view) return tree;
    const gapNode = { id: "__gap", gap: true, depth: view.gap.depth + 0, children: [] };
    let placed = false;
    function put(list, parentId) {
      const out = list.map(n => ({ ...n, children: put(n.children, n.id) }));
      if (parentId === view.gap.parentId && !placed) {
        const at = view.gap.beforeId ? out.findIndex(n => n.id === view.gap.beforeId) : -1;
        out.splice(at < 0 ? out.length : at, 0, gapNode);
        placed = true;
      }
      return out;
    }
    return put(tree, rootParentId);
  }, [tree, view, rootParentId]);

  function rowClasses(depth) {
    return [
      "topic-row",
      depth <= 1 ? "topic-row-roomy" : "is-child",
    ];
  }
  function wrapClass(depth, isLast, extra = "") {
    return `tree-node${depth === 0 ? " topic-block" : ""}${depth > 0 ? " is-nested" : ""}${isLast ? " is-last" : ""}${extra}`;
  }

  /* Rows are drawn by a function, not a component defined in here: a
     component declared inside DeckTree is a new type every render, so React
     threw the whole tree away and rebuilt it on each one — every pointer
     move of a drag — which is why nothing in it could ever animate. */
  function renderGap(n, isLast) {
    const depth = n.depth - base;
    return (
      <div key="__gap" className={wrapClass(depth, isLast)}>
        <div
          className={[...rowClasses(depth), "deck-gap"].join(" ")}
          data-flip-id="__gap"
          aria-hidden="true"
          style={{ paddingLeft: PAD + depth * STEP, "--depth": depth, height: view.gapH, minHeight: view.gapH, paddingTop: 0, paddingBottom: 0, boxSizing: "border-box" }}
        >
          <span className="deck-gap__slot" />
        </div>
      </div>
    );
  }

  function renderRow(n, isLast) {
    if (n.gap) return renderGap(n, isLast);
    const kids = n.children;
    const realKids = kids.filter(k => !k.gap && k.id !== view?.dragId);
    const isOpen = q ? true : shownOpen.has(n.id);
    const empty = n.avail === 0 && !(allowEmpty && n.mine);
    const st = state(n);
    const depth = n.depth - base;
    const lifted = view?.dragId === n.id;
    const cls = [
      ...rowClasses(depth),
      depth === 0 ? "is-block" : "",
      st === true ? "is-active" : "",
      empty ? "is-empty" : "",
      view?.intoId === n.id ? "is-drop" : "",
      canMove && n.mine ? "is-movable" : "",
    ].filter(Boolean).join(" ");
    const padLeft = PAD + depth * STEP;
    const menu = menuFor(n);

    return (
      <div key={n.id} className={wrapClass(depth, isLast, lifted ? " is-lifted" : "")}>
        <div
          className={cls}
          style={{ paddingLeft: padLeft, "--depth": depth }}
          data-deck-id={n.id}
          data-flip-id={n.id}
          onPointerDown={canMove && n.mine ? e => drag.onRowPointerDown(e, n.id) : undefined}
        >
          <span className="topic-twist">
            {realKids.length > 0 && (
              <button type="button" onClick={() => toggleOpen(n.id)} aria-expanded={isOpen}
                aria-label={`${isOpen ? "Hide" : "Show"} ${n.name}`} className={`topic-expand${isOpen ? " is-open" : ""}`}>
                <Chevron open={isOpen} />
              </button>
            )}
          </span>

          {renamingId === n.id ? (
            <div className="topic-hit is-renaming">
              <Check state={st} />
              <RenameField initial={n.name} onDone={name => onRename?.(n.id, name)} />
            </div>
          ) : (
          <button
            type="button"
            className="topic-hit"
            role="checkbox"
            aria-checked={st === "mixed" ? "mixed" : st}
            aria-keyshortcuts={canMove ? "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight" : undefined}
            disabled={n.avail === 0}
            onClick={() => toggleNode(n)}
            onKeyDown={e => onRowKey(e, n)}
          >
            <Check state={st} />
            <span className={`topic-name${depth === 0 ? " is-block" : depth >= 2 ? " is-child" : ""}`}><Marked text={n.name} q={q} />{n.byline && <span className="topic-by">by {n.byline}</span>}</span>
            {depth === 0
              ? <span className="topic-meta">{n.due > 0 && <Figure className="topic-due" n={n.due} unit="to review" title={`${n.due} due for review`} />}{n.total === 0 && n.mine ? <span className="topic-avail">empty</span> : <Figure className="topic-avail" n={n.avail} unit={n.avail === 1 ? "question" : "questions"} />}</span>
              : <Coverage seen={n.seen} total={n.total} avail={n.avail} due={n.due} dim={n.avail === 0 && !(allowEmpty && n.mine)} empty={n.mine && n.total === 0} />}
          </button>
          )}
          {menu ? <RowMenu node={n} items={menu} renderPicker={pickerFor(n)} /> : <span className="topic-menu-slot" aria-hidden="true" />}
        </div>
        {isOpen && !lifted && kids.length > 0 && (
          <div className="tree-kids">
            {kids.map((k, i) => renderRow(k, i === kids.length - 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Decks"
      className={`topic-tree-drop${view ? " is-armed" : ""}`}
    >
      {!q && showAll && (
        <button type="button" role="checkbox" aria-checked={isAll} onClick={pickAll}
          className={`topic-all${isAll ? " is-active" : ""}`}>
          <Check state={isAll} />
          <span className="topic-all__label">{allLabel}</span>
          <span className="topic-all__count">{totalAvail}</span>
        </button>
      )}
      {heading && tree.length > 0 && <h3 className="deck-section-h">{heading}</h3>}
      {q && tree.length === 0 && !quietNoMatch && (
        <p style={{ padding: "20px 4px", fontSize: 14.5, color: C.muted }}>No deck matches “{query.trim()}”.</p>
      )}
      {/* A deck holding its own questions has nothing under it to choose
          between, which is not the same as having nothing in it — and an
          unexplained blank where the list goes reads as the second. */}
      {!q && tree.length === 0 && showAll && (
        <p style={{ padding: "16px 4px", fontSize: 14.5, color: C.muted }}>
          No sub-decks — everything here is in the one deck.
        </p>
      )}
      {shown.map((r, i) => renderRow(r, i === shown.length - 1))}
      <div aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}

export { findNode };
