import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Choosing where generated questions go.
 *
 * This replaced two dropdowns that changed shape as you used them: one listing
 * every deck with "＋ New deck…" at the bottom, and a second that appeared only
 * if you chose that, asking which deck to put the new one "Inside" — whose
 * first option was "Top level". Both of those are gone. There is one row
 * showing where the questions are going, and it opens this.
 *
 * The thing it does differently is that creating is not a separate mode. The
 * new deck is made where you are standing in the list, so there is never a
 * second control asking for a parent, and so nothing ever has to say "top
 * level" — that is just what you get when you have not gone into anything.
 *
 * It does not try to work out which existing deck a lecture belongs to. That
 * needs to be right to be useful and is silently wrong when it is not — a
 * misfiled question is one you never see again. It names the new deck from the
 * file instead, which you can read and correct in one glance.
 */

/**
 * One row, with a rail of guide lines standing in for its ancestors.
 *
 * Indentation alone stops reading as a hierarchy past about two levels —
 * you end up counting pixels to work out whether "Week 2" is a sibling of
 * "Week 1" or of the thing above it. A line per ancestor is the same device
 * the deck tree uses and every file browser has.
 */
function Row({ label, depth = 0, count, chosen, muted, onClick }) {
  return (
    <button
      type="button"
      className={`dd-row${chosen ? " is-chosen" : ""}${muted ? " is-muted" : ""}`}
      onClick={onClick}
    >
      {depth > 0 && (
        <span className="dd-rail" aria-hidden="true">
          {Array.from({ length: depth }, (_, i) => <span key={i} className="dd-guide" />)}
        </span>
      )}
      <span className="dd-row-name">{label}</span>
      {typeof count === "number" && (
        <span className="dd-row-count">
          {count === 0 ? "empty" : <>{count}<span className="dd-row-unit">{count === 1 ? " question" : " questions"}</span></>}
        </span>
      )}
      <span className="dd-row-tick" aria-hidden="true">
        {chosen && (
          <svg width="15" height="15" viewBox="0 0 12 12">
            <path d="M2 6.4L4.6 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2.1"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

export default function DeckDestination({
  open, onClose, decks, countFor,
  chosenId, onChooseExisting,
  suggestedName = "", onCreate,
}) {
  const [query, setQuery] = useState("");
  /* Which row a new deck would be made in. Null is not a special case to
     explain, it is simply not having picked one. */
  const [inside, setInside] = useState(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setNaming(false);
    setInside(null);
    setName(suggestedName);
    /* Not on a phone: the keyboard covering the list you came to read is
       worse than one tap. */
    if (window.innerWidth > 640) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open, suggestedName]);

  useEffect(() => {
    if (naming) setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select(); }, 20);
  }, [naming]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    const out = [];
    const kids = pid => decks.filter(d => (d.parentId ?? null) === pid)
      .sort((a, b) => (a.position - b.position) || String(a.name).localeCompare(String(b.name)));
    (function walk(pid, depth) {
      for (const d of kids(pid)) { out.push({ ...d, depth }); walk(d.id, depth + 1); }
    })(null, 0);
    return out;
  }, [decks]);

  const q = query.trim().toLowerCase();
  /* Searching flattens the tree: a guide line pointing at a parent that was
     filtered out is worse than no line. The path is shown on the row instead
     so a filtered result still says where it lives. */
  const shown = q
    ? rows.filter(r => r.name.toLowerCase().includes(q)).map(r => ({ ...r, depth: 0, flat: true }))
    : rows;

  const insideName = inside ? rows.find(r => r.id === inside)?.name : null;

  /* "Week 1 › Upper Renal Tract", for a result whose parents are not shown. */
  function pathOf(id) {
    const out = [];
    const byId = new Map(decks.map(d => [d.id, d]));
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 32) { out.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : null; }
    return out.join(" › ");
  }

  if (!open) return null;

  function create() {
    const n = name.trim();
    if (!n) return;
    onCreate(n, inside);
    onClose();
  }

  return createPortal(
    <div
      className="dd-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Where the questions go"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dd-sheet anim-scale-in">
        <div className="dd-head">
          <span className="dd-title">Where do these go?</span>
          <button type="button" className="dd-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {rows.length > 6 && (
          <div className="dd-search">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your decks"
              aria-label="Search your decks"
            />
          </div>
        )}

        <div className="dd-list">
          {rows.length === 0 && (
            <p className="dd-none">No decks yet. Make the first one below.</p>
          )}
          {rows.length > 0 && shown.length === 0 && (
            <p className="dd-none">Nothing matches “{query.trim()}”.</p>
          )}
          {shown.map(r => (
            <Row
              key={r.id}
              label={r.flat ? pathOf(r.id) : r.name}
              depth={r.depth}
              count={countFor?.(r.id)}
              chosen={r.id === chosenId}
              muted={naming && inside !== r.id}
              onClick={() => {
                if (naming) { setInside(r.id); return; }
                onChooseExisting(r.id);
                onClose();
              }}
            />
          ))}
        </div>

        <div className="dd-foot">
          {naming ? (
            <form className="dd-new" onSubmit={e => { e.preventDefault(); create(); }}>
              <label className="dd-new-label">
                {insideName ? `New deck in ${insideName}` : "New deck"}
              </label>
              <div className="dd-new-row">
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  maxLength={80}
                  onChange={e => setName(e.target.value)}
                  placeholder="Name it"
                  aria-label="Name of the new deck"
                />
                <button type="submit" className="dd-create" disabled={!name.trim()}>Create</button>
              </div>
              <p className="dd-hint">
                {rows.length > 0
                  ? "Tap a deck above to put it inside that one."
                  : "It will sit on its own."}
              </p>
            </form>
          ) : (
            <button type="button" className="dd-newbtn" onClick={() => setNaming(true)}>
              <span aria-hidden="true">＋</span> New deck
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
