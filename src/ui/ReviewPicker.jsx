import { useEffect, useMemo, useRef, useState } from "react";
import { allKeys, idsFor } from "../lib/reviewGroups";

/**
 * Which topics to review, from Home's "Review N due" (Rafil, 2026-11-13).
 *
 * Everything starts ticked, so pressing Review straight away does what the
 * button always did. A topic with lectures under it opens to tick those one
 * by one. Built on the NamePrompt popup (np-*), like every popup here.
 */
export default function ReviewPicker({ groups, onStart, onClose }) {
  const [selected, setSelected] = useState(() => new Set(allKeys(groups)));
  const [open, setOpen] = useState(() => new Set());
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current?.focus();
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ids = useMemo(() => idsFor(groups, selected), [groups, selected]);
  const everything = allKeys(groups);
  const allOn = selected.size === everything.length;

  const setMany = (keys, on) => setSelected(s => {
    const n = new Set(s);
    keys.forEach(k => (on ? n.add(k) : n.delete(k)));
    return n;
  });
  const toggleOpen = key => setOpen(o => {
    const n = new Set(o);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  return (
    <div className="np-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="np rp" role="dialog" aria-modal="true" aria-labelledby="rp-title">
        <div className="rp__head">
          <h2 className="np__title" id="rp-title">Choose what to review</h2>
          <button type="button" className="rp__all" onClick={() => setMany(everything, !allOn)}>
            {allOn ? "Clear all" : "Select all"}
          </button>
        </div>

        <ul className="rp__list">
          {groups.map(g => {
            const keys = g.children.map(c => c.key);
            const on = keys.filter(k => selected.has(k)).length;
            const nested = g.children.length > 1;
            const isOpen = open.has(g.key);
            return (
              <li key={g.key}>
                <div className="rp__row">
                  <label className="rp__pick">
                    <input type="checkbox" checked={on === keys.length}
                      ref={el => { if (el) el.indeterminate = on > 0 && on < keys.length; }}
                      onChange={e => setMany(keys, e.target.checked)} />
                    <span className="rp__name">{g.name}</span>
                  </label>
                  <span className="rp__n">{g.count}</span>
                  {nested ? (
                    <button type="button" className={`rp__more${isOpen ? " is-open" : ""}`}
                      aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} lectures in ${g.name}`}
                      onClick={() => toggleOpen(g.key)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                  ) : <span className="rp__more is-blank" aria-hidden="true" />}
                </div>
                {nested && isOpen && (
                  <ul className="rp__sub">
                    {g.children.map(c => (
                      <li key={c.key} className="rp__row">
                        <label className="rp__pick">
                          <input type="checkbox" checked={selected.has(c.key)} onChange={e => setMany([c.key], e.target.checked)} />
                          <span className="rp__name">{c.name}</span>
                        </label>
                        <span className="rp__n">{c.ids.length}</span>
                        <span className="rp__more is-blank" aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="np__row">
          <button ref={startRef} type="button" className="np__save btn-press" disabled={!ids.length} onClick={() => onStart(ids)}>
            {ids.length ? `Review ${ids.length}` : "Pick a topic"}
          </button>
          <button type="button" className="np__skip" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
