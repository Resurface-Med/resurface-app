import { useMemo, useState, useRef, useCallback } from "react";
import { C } from "./theme";
import Popover, { MenuItems } from "./Popover";
import { leavesUnder, findNode, canDropDeck } from "../lib/decks";

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

/** A row's own menu. Only your decks have one. */
function RowMenu({ node, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className="deck-menu">
      <button ref={ref} type="button" className="deck-menu-btn" aria-label={`Options for ${node.name}`} aria-haspopup="menu" aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.25" cy="8" r="1.2" fill="currentColor" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="12.75" cy="8" r="1.2" fill="currentColor" />
        </svg>
      </button>
      <Popover anchorRef={ref} open={open} onClose={close}>
        <MenuItems items={items} onPick={it => { setOpen(false); it.onSelect(node, ref.current); }} />
      </Popover>
    </span>
  );
}

/** Prune to rows matching the query, keeping the ancestors above a match. */
function prune(nodes, q) {
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
  /* Dragging a row onto another re-parents it. moveDeck has existed in
     App.jsx since decks did, and no component had ever called it. */
  onMove = null,
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
  function toggleOpen(id) {
    setOpen(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function emit(next) {
    if (!next || next.size === 0) onChange({ leaves: ["All"] });
    else onChange({ leaves: [...next] });
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

  /*
   * Dragging a deck onto another, on pointer events rather than HTML5 drag.
   *
   * Three attempts at the native API did not survive contact: the row would
   * grey out and nothing would land, because a dragover handler that fails to
   * call preventDefault refuses the drop in silence and there is no way to
   * see which of a dozen reasons it was. Pointer events have none of that —
   * no drag images, no dataTransfer, no dropEffect, and the element under the
   * cursor is whatever elementFromPoint says it is. They are also the same
   * events a finger produces, so touch comes free when phones get this.
   *
   * A drag starts only after the pointer has moved a few pixels, so a plain
   * click on a row still ticks it.
   */
  const dragRef = useRef(null);      // { id, startX, startY, moved }
  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);

  function rowUnder(x, y) {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest?.("[data-deck-id]");
    return row?.dataset.deckId ?? null;
  }

  function beginDrag(e, id) {
    /* Left button only, and never from a control inside the row — the
       chevron and the menu have their own jobs. */
    if (e.button !== 0) return;
    if (e.target.closest("button, [role='menu']") && !e.target.closest(".topic-hit")) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < 6 && Math.abs(e.clientY - d.startY) < 6) return;
      d.moved = true;
      setDragId(d.id);
    }
    const over = rowUnder(e.clientX, e.clientY);
    setDropId(over !== null && !canDropDeck(forest, dragRef.current?.id, over) ? null : over);
  }

  function endDrag(e) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const wasDragging = d.moved;
    setDragId(null);
    setDropId(null);
    if (!wasDragging) return;
    /* Suppress the click the pointer-up would otherwise produce, so finishing
       a drag on a row does not also tick it. */
    e.preventDefault();
    const to = rowUnder(e.clientX, e.clientY);
    if (to === d.id) return;
    if (to !== null && !canDropDeck(forest, d.id, to)) return;
    onMove?.(d.id, to);
  }


  const STEP = 26, PAD = 14;

  function Row({ n, isLast }) {
    const kids = n.children;
    const isOpen = q ? true : open.has(n.id);
    const empty = n.avail === 0 && !(allowEmpty && n.mine);
    const st = state(n);
    const depth = n.depth - base;
    const nested = depth > 0;
    const dragging = dragId === n.id;
    const over = dropId === n.id;
    const cls = [
      "topic-row",
      depth <= 1 ? "topic-row-roomy" : "is-child",
      depth === 0 ? "is-block" : "",
      st === true ? "is-active" : "",
      empty ? "is-empty" : "",
      dragging ? "is-dragging" : "",
      over ? "is-drop" : "",
    ].filter(Boolean).join(" ");
    const padLeft = PAD + depth * STEP;
    const menu = rowMenu && n.mine ? rowMenu(n) : null;

    return (
      <div
        className={`tree-node${depth === 0 ? " topic-block" : ""}${nested ? " is-nested" : ""}${isLast ? " is-last" : ""}`}
      >
        <div
          className={cls}
          style={{ paddingLeft: padLeft, "--depth": depth }}
          /* The row carries its id; the dragging is done by the pointer
             handlers on the container, which find rows by coordinate. */
          data-deck-id={n.id}
          onPointerDown={onMove && n.mine ? e => beginDrag(e, n.id) : undefined}
        >
          <span className="topic-twist">
            {kids.length > 0 && (
              <button type="button" onClick={() => toggleOpen(n.id)} aria-expanded={isOpen}
                aria-label={`${isOpen ? "Hide" : "Show"} ${n.name}`} className={`topic-expand${isOpen ? " is-open" : ""}`}>
                <Chevron open={isOpen} />
              </button>
            )}
          </span>

          <button
            type="button"
            className="topic-hit"
            role="checkbox"
            aria-checked={st === "mixed" ? "mixed" : st}
            disabled={n.avail === 0}
            onClick={() => toggleNode(n)}
          >
            <Check state={st} />
            <span className={`topic-name${depth === 0 ? " is-block" : depth >= 2 ? " is-child" : ""}`}>{n.name}</span>
            {depth === 0
              ? <span className="topic-meta">{n.due > 0 && <Figure className="topic-due" n={n.due} unit="to review" title={`${n.due} due for review`} />}{n.total === 0 && n.mine ? <span className="topic-avail">empty</span> : <Figure className="topic-avail" n={n.avail} unit={n.avail === 1 ? "question" : "questions"} />}</span>
              : <Coverage seen={n.seen} total={n.total} avail={n.avail} due={n.due} dim={n.avail === 0 && !(allowEmpty && n.mine)} empty={n.mine && n.total === 0} />}
          </button>
          {menu ? <RowMenu node={n} items={menu} /> : <span className="topic-menu-slot" aria-hidden="true" />}
        </div>
        {isOpen && kids.length > 0 && (
          <div className="tree-kids">
            {kids.map((k, i) => <Row key={k.id} n={k} isLast={i === kids.length - 1} />)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label="Decks"
      /* Space below the rows to drop onto, and a lit edge while a drag is
         over it, so "out of the deck it is in" is somewhere you can aim. */
      className={`topic-tree-drop${dragId ? " is-armed" : ""}${dragId && dropId === null ? " is-drop-root" : ""}`}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      /* A pointer that leaves the window, or is taken by something else,
         must not leave a drag running for ever. */
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
    >
      {!q && showAll && (
        <button type="button" role="checkbox" aria-checked={isAll} onClick={pickAll}
          className={`topic-all${isAll ? " is-active" : ""}`}>
          <Check state={isAll} />
          <span className="topic-all__label">{allLabel}</span>
          <span className="topic-all__count">{totalAvail}</span>
        </button>
      )}
      {q && tree.length === 0 && (
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
      {tree.map((r, i) => <Row key={r.id} n={r} isLast={i === tree.length - 1} />)}
    </div>
  );
}

export { findNode };
