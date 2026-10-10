import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Choosing where generated questions go.
 *
 * This replaced two dropdowns that changed shape as you used them: one listing
 * every deck with "＋ New deck…" at the bottom, and a second that appeared only
 * if you chose that, asking which deck to put the new one "Inside" — whose
 * first option was "Top level".
 *
 * It does not draw a tree. The first version did, with a guide line per
 * ancestor, and a tree is the wrong shape for this job: every level competes
 * for the same glance, rows must stay small to leave room for the
 * indentation, and on a phone the deepest ones have no width left. What a move
 * dialog wants is one level at a time and a breadcrumb — Drive, Files and
 * Dropbox all settled here — so depth costs nothing to draw, rows can be as
 * big as a thumb, and there is no hierarchy to render because you are standing
 * in it.
 *
 * Tapping a deck that contains others goes in. Tapping one that does not picks
 * it, which is the common case, since questions live in the lecture at the
 * bottom. Picking a deck that does have children is still possible, from the
 * footer, where it reads as a deliberate choice rather than a mis-tap.
 *
 * It does not guess which deck a lecture belongs to. That has to be right to
 * be useful and is silently wrong when it is not — a misfiled question is one
 * you never see again. It names a new deck from the file instead, which you
 * can read and correct at a glance.
 */

function Chevron() {
  return (
    <svg className="dd-go" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M6.5 3.5L12 9l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick() {
  return (
    <svg className="dd-tick" width="18" height="18" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.4L4.6 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2.1"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DeckDestination({
  open, onClose, decks, countFor,
  chosenId, onChooseExisting,
  suggestedName = "", onCreate,
}) {
  /* Where you are standing. null is the top of your decks, which needs no
     name because the breadcrumb shows it. */
  const [at, setAt] = useState(null);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef(null);

  const byId = useMemo(() => new Map(decks.map(d => [d.id, d])), [decks]);
  const childrenOf = useMemo(() => {
    const m = new Map();
    for (const d of decks) {
      const k = d.parentId ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.position - b.position) || String(a.name).localeCompare(String(b.name)));
    }
    return m;
  }, [decks]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setNaming(false);
    setName(suggestedName);
    /* Open standing where the current choice lives, so Change lands beside
       what it is changing rather than at the top of everything. */
    const chosen = chosenId ? byId.get(chosenId) : null;
    setAt(chosen ? (chosen.parentId ?? null) : null);
  }, [open, suggestedName, chosenId, byId]);

  useEffect(() => {
    if (naming) setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select(); }, 20);
  }, [naming]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** Ancestors of where you are, outermost first. */
  const trail = useMemo(() => {
    const out = [];
    let cur = at ? byId.get(at) : null;
    let guard = 0;
    while (cur && guard++ < 32) { out.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : null; }
    return out;
  }, [at, byId]);

  const q = query.trim().toLowerCase();
  const here = childrenOf.get(at) ?? [];
  const results = q ? decks.filter(d => d.name.toLowerCase().includes(q)) : null;

  function pathOf(id) {
    const out = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 32) { out.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : null; }
    return out;
  }

  function choose(id) { onChooseExisting(id); onClose(); }

  function create() {
    const n = name.trim();
    if (!n) return;
    onCreate(n, at);
    onClose();
  }

  if (!open) return null;

  const hereName = at ? byId.get(at)?.name : null;

  function Item({ d, subtitle }) {
    const kids = childrenOf.get(d.id) ?? [];
    const n = countFor?.(d.id) ?? 0;
    const chosen = d.id === chosenId;
    const sub = subtitle ?? [
      kids.length ? `${kids.length} inside` : null,
      n ? `${n} question${n === 1 ? "" : "s"}` : (kids.length ? null : "empty"),
    ].filter(Boolean).join(" · ");
    return (
      <li>
        <button
          type="button"
          className={`dd-item${chosen ? " is-chosen" : ""}`}
          onClick={() => { if (kids.length) { setAt(d.id); setQuery(""); } else choose(d.id); }}
        >
          <span className="dd-item-text">
            <span className="dd-item-name">{d.name}</span>
            <span className="dd-item-sub">{sub}</span>
          </span>
          {chosen && <Tick />}
          {kids.length > 0 && <Chevron />}
        </button>
      </li>
    );
  }

  return createPortal(
    <div
      className="dd-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Where the questions go"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dd-sheet">
        <header className="dd-head">
          <h2 className="dd-title">Where do these go?</h2>
          <button type="button" className="dd-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="dd-search">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search all decks"
            aria-label="Search all decks"
          />
        </div>

        {/* Where you are, and the way back out of it. */}
        {!q && (
          <nav className="dd-crumbs" aria-label="Location">
            <button type="button" className="dd-crumb" onClick={() => setAt(null)} disabled={at === null}>
              All decks
            </button>
            {trail.map(d => (
              <span key={d.id} className="dd-crumb-wrap">
                <span className="dd-crumb-sep" aria-hidden="true">›</span>
                <button type="button" className="dd-crumb" onClick={() => setAt(d.id)} disabled={d.id === at}>
                  {d.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        <div className="dd-list">
          {q ? (
            results.length === 0
              ? <p className="dd-none">Nothing matches “{query.trim()}”.</p>
              : (
                <ul className="dd-items">
                  {results.map(d => (
                    <Item key={d.id} d={d} subtitle={pathOf(d.id).slice(0, -1).join(" › ") || "Top of your decks"} />
                  ))}
                </ul>
              )
          ) : here.length === 0 ? (
            <p className="dd-none">{at ? `Nothing inside ${hereName} yet.` : "No decks yet."}</p>
          ) : (
            <ul className="dd-items">
              {here.map(d => <Item key={d.id} d={d} />)}
            </ul>
          )}
        </div>

        <footer className="dd-foot">
          {naming ? (
            <form className="dd-new" onSubmit={e => { e.preventDefault(); create(); }}>
              <label className="dd-new-label" htmlFor="dd-new-name">
                {hereName ? `New deck in ${hereName}` : "New deck"}
              </label>
              <div className="dd-new-row">
                <input
                  id="dd-new-name"
                  ref={nameRef}
                  type="text"
                  value={name}
                  maxLength={80}
                  onChange={e => setName(e.target.value)}
                  placeholder="Name it"
                />
                <button type="submit" className="dd-primary" disabled={!name.trim()}>Create</button>
              </div>
            </form>
          ) : (
            <div className="dd-actions">
              <button type="button" className="dd-ghost" onClick={() => setNaming(true)}>
                <span aria-hidden="true">＋</span> New deck{hereName ? ` here` : ""}
              </button>
              {/* Filing straight into a deck that has others inside it is
                  unusual but legitimate, so it lives here rather than on the
                  row, where it would compete with going in. */}
              {at && (
                <button type="button" className="dd-primary" onClick={() => choose(at)}>
                  Use {hereName}
                </button>
              )}
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
