import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compareDecks } from "../lib/deckOrder";

/**
 * Where generated questions go, chosen by pointing at the tree.
 *
 * It replaced a text field that took Anki's "::" syntax ("Week 1 - Renal::
 * Upper Renal Tract"), a suggestion list and a Browse modal: three controls
 * and a file-path grammar for one decision (2026-10-17). Now it is the same
 * tree as Study. Tap a deck and the lecture's card glides into that row; the
 * path along the bottom builds itself. "＋ New deck here" sits inside the
 * chosen deck, already named after the lecture.
 *
 * `value` is still the "::" path the rest of Generate reads — the parts that
 * exist are decks, anything after them is to be made — so saving, batches and
 * duplicate-avoidance are untouched by how it is picked.
 */
const split = v => String(v ?? "").split("::").map(x => x.trim()).filter(Boolean);

export default function DeckPlacer({ decks, value, onChange, countFor, cardTitle, cardSub, suggestedName = "" }) {
  const byId = useMemo(() => new Map(decks.map(d => [d.id, d])), [decks]);
  const kids = useMemo(() => {
    const m = new Map();
    for (const d of decks) {
      const p = d.parentId ?? null;
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(d);
    }
    for (const list of m.values()) list.sort(compareDecks);
    return m;
  }, [decks]);
  const pathOf = id => {
    const out = [];
    for (let d = byId.get(id); d; d = byId.get(d.parentId)) out.unshift(d.name);
    return out;
  };

  /* The value, read back: the deepest deck that exists, and what is new. */
  const parts = split(value);
  let existingId = null, used = 0;
  for (const part of parts) {
    const hit = (kids.get(existingId) ?? []).find(d => d.name.trim().toLowerCase() === part.toLowerCase());
    if (!hit) break;
    existingId = hit.id; used += 1;
  }
  const fresh = parts.slice(used);
  const selectedKey = fresh.length ? `new:${existingId}` : existingId;

  const [open, setOpen] = useState(() => {
    const s = new Set();
    for (let d = byId.get(existingId); d; d = byId.get(d.parentId)) s.add(d.id);
    return s;
  });
  const [naming, setNaming] = useState(null);          // parent id (or "root") being named into
  const [draft, setDraft] = useState("");

  function choose(id) {
    setNaming(null);
    setOpen(o => new Set(o).add(id));
    onChange(pathOf(id).join("::"));
  }
  function startNew(parentId) {
    setNaming(parentId ?? "root");
    setDraft(suggestedName);
  }
  function commitNew() {
    const name = draft.trim();
    const parentId = naming === "root" ? null : naming;
    setNaming(null);
    if (!name) return;
    onChange([...(parentId ? pathOf(parentId) : []), name].join("::"));
  }

  /* The card glides into the row it is going to: a copy of it, flown from
     where the card sits to the chosen row and faded as it lands. */
  const cardRef = useRef(null);
  const listRef = useRef(null);
  const lastKey = useRef(selectedKey);
  useLayoutEffect(() => {
    if (lastKey.current === selectedKey) return;
    lastKey.current = selectedKey;
    const card = cardRef.current;
    const row = listRef.current?.querySelector(".dp-row.is-chosen");
    if (!card || !row || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const a = card.getBoundingClientRect(), b = row.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("dp-ghost");
    Object.assign(ghost.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: 0, zIndex: 50, pointerEvents: "none" });
    document.body.appendChild(ghost);
    const s = Math.min(1, b.height / a.height);
    const dx = b.left + 24 - a.left, dy = b.top + (b.height - a.height * s) / 2 - a.top;
    const anim = ghost.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s * 0.92})`, opacity: 0.9, offset: 0.8 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s * 0.85})`, opacity: 0 },
    ], { duration: 460, easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
    anim.onfinish = () => ghost.remove();
    row.classList.remove("is-landed");
    void row.offsetWidth;
    row.classList.add("is-landed");
  }, [selectedKey]);

  const newRow = parentId => (
    naming === (parentId ?? "root") ? (
      <li className="dp-item">
        <span className="dp-row is-naming">
          <input
            className="dp-name-input"
            value={draft}
            autoFocus
            onFocus={e => e.target.select()}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitNew(); } if (e.key === "Escape") setNaming(null); }}
            onBlur={commitNew}
            placeholder="Deck name"
            maxLength={80}
            aria-label="New deck name"
          />
        </span>
      </li>
    ) : (
      <li className="dp-item">
        <button type="button" className="dp-row dp-add" onClick={() => startNew(parentId)}>
          <span className="dp-add-plus" aria-hidden="true">＋</span> New deck{parentId ? " here" : ""}
        </button>
      </li>
    )
  );

  function branch(parentId) {
    const list = kids.get(parentId) ?? [];
    return (
      <ul className="dp-list">
        {list.map(d => {
          const has = (kids.get(d.id) ?? []).length > 0;
          const isOpen = open.has(d.id);
          const chosen = selectedKey === d.id;
          const n = countFor?.(d.id) ?? 0;
          return (
            <li key={d.id} className="dp-item">
              <span className={`dp-row${chosen ? " is-chosen" : ""}`}>
                {has || chosen ? (
                  <button type="button" className={`dp-caret${isOpen ? " is-open" : ""}`} aria-label={isOpen ? `Close ${d.name}` : `Open ${d.name}`}
                    onClick={() => setOpen(o => { const s = new Set(o); s.has(d.id) ? s.delete(d.id) : s.add(d.id); return s; })}>
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                ) : <span className="dp-caret-gap" />}
                <button type="button" className="dp-pick" aria-pressed={chosen} onClick={() => choose(d.id)}>
                  <span className="dp-name">{d.name}</span>
                  <span className="dp-count">{n === 0 ? "empty" : `${n} question${n === 1 ? "" : "s"}`}</span>
                </button>
              </span>
              {isOpen && (
                <div className="dp-kids">
                  {branch(d.id)}
                </div>
              )}
              {/* A deck still to be made, inside this one. */}
              {fresh.length > 0 && existingId === d.id && !isOpen && pending()}
            </li>
          );
        })}
        {fresh.length > 0 && existingId === parentId && (parentId === null || open.has(parentId)) && pending()}
        {(parentId === null || selectedKey === parentId || naming === parentId) && newRow(parentId)}
      </ul>
    );
  }
  function pending() {
    return (
      <ul className="dp-list dp-pending">
        <li className="dp-item">
          <span className="dp-row is-chosen is-new">
            <span className="dp-caret-gap" />
            <button type="button" className="dp-pick" onClick={() => startNew(existingId)}>
              <span className="dp-name">{fresh.join(" › ")}</span>
              <span className="dp-count">new deck</span>
            </button>
          </span>
        </li>
      </ul>
    );
  }

  /* No decks yet: straight to naming the first one. */
  useEffect(() => {
    if (!decks.length && !parts.length && naming === null) startNew(null);
  }, [decks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dp">
      <div ref={cardRef} className="dp-card" aria-hidden="true">
        <svg className="dp-card-icon" width="20" height="20" viewBox="0 0 20 20"><path d="M5 2.5h6.5L15.5 6.5V17a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M11.5 2.5V6.5h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <span className="dp-card-text">
          <span className="dp-card-title">{cardTitle}</span>
          {cardSub && <span className="dp-card-sub">{cardSub}</span>}
        </span>
      </div>
      <div ref={listRef} className="dp-tree" role="group" aria-label="Decks">
        {branch(null)}
      </div>
      <p className="dp-path" aria-live="polite">
        {parts.length ? parts.map((p, i) => (
          <span key={parts.slice(0, i + 1).join("::")} className="dp-crumb" style={{ "--i": i }}>
            {i > 0 && <span className="dp-sep" aria-hidden="true">›</span>}
            <span className={`dp-crumb-name${i >= used ? " is-new" : ""}`}>{p}</span>
          </span>
        )) : <span className="dp-path-empty">Pick a deck, or make a new one</span>}
      </p>
    </div>
  );
}
