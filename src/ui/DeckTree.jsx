import { useMemo, useState, useRef, useCallback } from "react";
import { C } from "./theme";
import Popover, { MenuItems } from "./Popover";
import { leavesUnder, findNode, BANK_ROOT } from "../lib/decks";

/**
 * The deck tree: what you are revising.
 *
 * One component for any depth. The bank is "ARU Year 1 › block › subject ›
 * topic"; your decks are however deep you made them. Tick a row to
 * practise everything under it — a parent is on when all its leaves are,
 * mixed when some are. Rows carry a coverage bar and a count, and a
 * chevron where there is more underneath. A deck of yours also carries a
 * small menu at the end of its row: rename, delete, add to it.
 *
 * Selection is a Set of leaf ids, or null for everything shown.
 */

function Coverage({ seen, total, avail, dim }) {
  const pct = total > 0 ? Math.min(100, Math.round((seen / total) * 100)) : 0;
  return (
    <span className="topic-meta" style={{ opacity: dim ? 0.45 : 1 }}>
      <span className="topic-bar" role="img" aria-label={`${seen} of ${total} seen`}>
        <span className="topic-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="topic-avail">{avail}</span>
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
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>⋯</button>
      <Popover anchorRef={ref} open={open} onClose={close}>
        <MenuItems items={items} onPick={it => { setOpen(false); it.onSelect(node); }} />
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
  allLabel = "Everything", showAll = true,
  rowMenu = null, allowEmpty = false,
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

  const totalAvail = useMemo(() => forest.reduce((n, r) => n + r.avail, 0), [forest]);

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

  function Row({ n }) {
    const kids = n.children;
    const isOpen = q ? true : open.has(n.id);
    const empty = n.avail === 0 && !(allowEmpty && n.mine);
    const st = state(n);
    const depth = n.depth - base;
    const roomy = depth <= 1;
    const cls = [
      "topic-row",
      roomy ? "topic-row-roomy" : "is-child",
      depth === 0 ? "is-block" : "",
      st === true ? "is-active" : "",
      empty ? "is-empty" : "",
    ].filter(Boolean).join(" ");
    const indent = depth >= 2 ? { paddingLeft: 28 + (depth - 2) * 18 } : undefined;
    const menu = rowMenu && n.mine ? rowMenu(n) : null;

    return (
      <div className={depth === 0 ? "topic-block" : "topic-group"}>
        <div className={cls} style={indent}>
          <button
            type="button"
            role="checkbox"
            aria-checked={st === "mixed" ? "mixed" : st}
            disabled={n.avail === 0}
            onClick={() => toggleNode(n)}
            className="topic-hit"
          >
            <Check state={st} />
            <span className={`topic-name${depth === 0 ? " is-block" : depth >= 2 ? " is-child" : ""}`}>{n.name}</span>
            {depth === 0
              ? <span className="topic-meta"><span className="topic-avail">{n.avail}</span></span>
              : <Coverage seen={n.seen} total={n.total} avail={n.avail} dim={n.avail === 0} />}
          </button>
          {menu && <RowMenu node={n} items={menu} />}
          {kids.length > 0 && (
            <button type="button" onClick={() => toggleOpen(n.id)} aria-expanded={isOpen}
              aria-label={`${isOpen ? "Hide" : "Show"} ${n.name}`} className={`topic-expand${isOpen ? " is-open" : ""}`}>
              <Chevron open={isOpen} />
            </button>
          )}
        </div>
        {isOpen && kids.map(k => <Row key={k.id} n={k} />)}
      </div>
    );
  }

  return (
    <div role="group" aria-label="Decks">
      {!q && showAll && (
        <button type="button" role="checkbox" aria-checked={isAll} onClick={pickAll}
          className={`topic-row topic-row-roomy${isAll ? " is-active" : ""}`}>
          <Check state={isAll} />
          <span className="topic-name" style={{ fontWeight: 600 }}>{allLabel}</span>
          <span className="topic-meta"><span className="topic-avail">{totalAvail}</span></span>
        </button>
      )}
      {q && tree.length === 0 && (
        <p style={{ padding: "20px 4px", fontSize: 14.5, color: C.muted }}>No deck matches “{query.trim()}”.</p>
      )}
      {tree.map(r => <Row key={r.id} n={r} />)}
    </div>
  );
}

export { BANK_ROOT, findNode };
