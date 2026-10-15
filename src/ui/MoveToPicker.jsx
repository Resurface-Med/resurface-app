import { useMemo, useState } from "react";

/**
 * Move to…: every deck the chosen one could go into, as an indented list,
 * opened from the row's own ⋯ so it appears beside the thing it moves. The
 * last version opened far from the row and was taken out (2026-09-19); this
 * one lives in the row's Popover.
 *
 * The deck itself and everything under it are left out — a deck cannot go
 * inside itself — and the deck it is in now is shown but not offered.
 */
export default function MoveToPicker({ forest, node, currentParentId, rootLabel = "Top level", onPick }) {
  const [q, setQ] = useState("");
  const options = useMemo(() => {
    const out = [];
    (function walk(nodes, depth) {
      for (const n of nodes) {
        if (n.id === node.id) continue;
        out.push({ id: n.id, name: n.name, depth });
        walk(n.children, depth + 1);
      }
    })(forest, 0);
    return out;
  }, [forest, node.id]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter(o => o.name.toLowerCase().includes(needle)) : options;
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  return (
    <div className="move-pick" onClick={e => e.stopPropagation()}>
      <p className="move-pick__title">Move “{node.name}” to</p>
      {options.length > 6 && (
        <input
          type="search"
          className="move-pick__search"
          placeholder="Find a deck"
          aria-label="Find a deck"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus={!coarse}
        />
      )}
      <div className="move-pick__list" role="listbox" aria-label="Destination">
        {!needle && (
          <button type="button" role="option" aria-selected={currentParentId === null} className="pop-item move-pick__item"
            disabled={currentParentId === null} onClick={() => onPick(null)}>
            {rootLabel}{currentParentId === null && <span className="move-pick__here">Here now</span>}
          </button>
        )}
        {shown.map(o => {
          const here = o.id === currentParentId;
          return (
            <button key={o.id} type="button" role="option" aria-selected={here} className="pop-item move-pick__item"
              style={{ paddingLeft: 12 + (needle ? 0 : o.depth * 14) }}
              disabled={here} onClick={() => onPick(o.id)}>
              <span className="move-pick__name">{o.name}</span>
              {here && <span className="move-pick__here">Here now</span>}
            </button>
          );
        })}
        {needle && shown.length === 0 && <p className="pop-empty">No deck called that.</p>}
      </div>
    </div>
  );
}
