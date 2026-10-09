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

function Row({ label, depth = 0, count, chosen, muted, onClick }) {
  return (
    <button
      type="button"
      className={`dd-row${chosen ? " is-chosen" : ""}${muted ? " is-muted" : ""}`}
      style={{ paddingLeft: 14 + depth * 18 }}
      onClick={onClick}
    >
      <span className="dd-row-name">{label}</span>
      {typeof count === "number" && (
        <span className="dd-row-count">{count === 0 ? "empty" : `${count}`}</span>
      )}
      {chosen && (
        <svg className="dd-row-tick" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.4L4.6 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2.1"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
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

  /* Searching flattens the tree. Indentation is only meaningful next to the
     parent it is indented from, and a filtered list has lost those. */
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter(r => r.name.toLowerCase().includes(q)).map(r => ({ ...r, depth: 0 }))
    : rows;

  const insideName = inside ? rows.find(r => r.id === inside)?.name : null;

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
              label={r.name}
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
