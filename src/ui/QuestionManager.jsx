import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { questionsInDeck } from "../lib/decks";
import { compareDecks } from "../lib/deckOrder";
import EditQuestionModal from "./EditQuestionModal";

/**
 * Manage questions: every question in a deck (and its sub-decks), to read,
 * edit, move or delete — one at a time or several (2026-10-17). Opened from
 * a deck's ⋯ menu.
 *
 * A panel on a desktop, the whole screen on a phone. Rows open to show the
 * options with the right one marked and the explanation. Ticking rows brings
 * up a bar to move or delete them together. Deleting collapses the rows and
 * offers an undo (lib/undo); nothing leaves the server until it has passed.
 */
const LETTERS = "ABCDE";

const Check = ({ on }) => (
  <span className={`qm-check${on ? " is-on" : ""}`} aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);
const Chevron = ({ open }) => (
  <svg className={`qm-chev${open ? " is-open" : ""}`} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/* `editPersist`: where an edit is saved, when not to your own corrections (an
   admin managing a Resurface deck). Without actions.moveQuestions there is
   no Move — a featured deck's questions stay in it. */
export default function QuestionManager({ deckId, decks, pStats = {}, actions, onClose, editPersist = null }) {
  const deck = decks.find(d => d.id === deckId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [leaving, setLeaving] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);          // ids being moved, choosing where
  const [closing, setClosing] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onKey = e => {
      if (e.key !== "Escape" || editing) return;
      if (moving) setMoving(null); else close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function close() {
    setClosing(true);
    setTimeout(onClose, 220);
  }

  /* Everything under this deck, grouped by the sub-deck it is in. */
  /* Read fresh every render: a delete, move or edit changes the pool
     without changing the decks, so a memo here kept showing what was gone.
     `version` is read so an edit (which only touches the pool) re-renders. */
  void version;
  const all = questionsInDeck(deckId);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? all.filter(q => [q.q, ...(q.opts ?? []), q.exp].some(t => typeof t === "string" && t.toLowerCase().includes(needle)))
    : all;
  const where = q => {
    const path = q.path ?? [];
    const at = path.findIndex(p => p.id === deckId);
    return path.slice(at + 1).map(p => p.name).join(" › ");
  };

  const toggle = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allPicked = shown.length > 0 && shown.every(q => picked.has(q.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(shown.map(q => q.id)));

  /* Rows fold away first, then go. */
  function remove(ids) {
    setLeaving(new Set(ids));
    setTimeout(() => {
      actions.deleteQuestions(ids);
      setLeaving(new Set());
      setPicked(p => { const n = new Set(p); ids.forEach(i => n.delete(i)); return n; });
      if (ids.includes(open)) setOpen(null);
    }, 260);
  }
  function moveTo(targetId) {
    const ids = moving;
    setMoving(null);
    if (!ids?.length || !targetId) return;
    const stays = targetId === deckId || decks.some(d => d.id === targetId && isUnder(d.id));
    if (!stays) setLeaving(new Set(ids));
    setTimeout(() => {
      actions.moveQuestions(ids, targetId);
      setLeaving(new Set());
      setPicked(new Set());
    }, stays ? 0 : 260);
  }
  function isUnder(id) {
    for (let d = decks.find(x => x.id === id); d; d = decks.find(x => x.id === d.parentId)) if (d.id === deckId) return true;
    return false;
  }

  /* Destinations for Move: every deck, indented under its parent. */
  const destinations = useMemo(() => {
    const kids = new Map();
    for (const d of decks) { const p = d.parentId ?? null; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(d); }
    for (const l of kids.values()) l.sort(compareDecks);
    const out = [];
    (function walk(p, depth) { for (const d of kids.get(p) ?? []) { out.push({ d, depth }); walk(d.id, depth + 1); } })(null, 0);
    return out;
  }, [decks]);

  const stat = q => {
    const s = pStats[q.id];
    if (!s?.total) return "Not answered yet";
    return `Answered ${s.total} time${s.total === 1 ? "" : "s"} · ${Math.round((s.correct / s.total) * 100)}% right`;
  };

  return createPortal(
    <div className={`qm-scrim${closing ? " is-closing" : ""}`} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="qm" role="dialog" aria-modal="true" aria-label={`Questions in ${deck?.name ?? "deck"}`}>
        <header className="qm-head">
          <div className="qm-title-row">
            <div className="qm-titles">
              <h2 className="qm-title">{deck?.name ?? "Deck"}</h2>
              <p className="qm-sub">{all.length} question{all.length === 1 ? "" : "s"}</p>
            </div>
            <button type="button" className="qm-x btn-press" onClick={close} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="qm-tools">
            <label className="qm-search">
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search questions" aria-label="Search questions" />
            </label>
            {shown.length > 0 && (
              <button type="button" className="qm-all" onClick={pickAll}>{allPicked ? "Clear" : "Select all"}</button>
            )}
          </div>
        </header>

        <ol className="qm-list">
          {shown.length === 0 && (
            <li className="qm-empty">
              {all.length === 0 ? "This deck has no questions yet." : "No questions match that search."}
            </li>
          )}
          {shown.map((q, i) => {
            const isOpen = open === q.id;
            const sub = where(q);
            return (
              <li key={q.id} className={`qm-item${isOpen ? " is-open" : ""}${picked.has(q.id) ? " is-picked" : ""}${leaving.has(q.id) ? " is-leaving" : ""}`}
                style={{ "--i": Math.min(i, 18) }}>
                <div className="qm-row">
                  <button type="button" className="qm-pick" onClick={() => toggle(q.id)} aria-pressed={picked.has(q.id)} aria-label="Select question">
                    <Check on={picked.has(q.id)} />
                  </button>
                  <button type="button" className="qm-main" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen}>
                    <span className="qm-q">{q.q}</span>
                    <span className="qm-meta">
                      {sub && <span className="qm-where">{sub}</span>}
                      <span>{stat(q)}</span>
                    </span>
                  </button>
                  <Chevron open={isOpen} />
                </div>
                <div className="qm-more">
                  <div className="qm-more-in">
                    <ol className="qm-opts">
                      {(q.opts ?? []).map((o, oi) => (
                        <li key={oi} className={`qm-opt${oi === q.ans ? " is-ans" : ""}`}>
                          <span className="qm-letter">{LETTERS[oi]}</span>
                          <span>{o}</span>
                        </li>
                      ))}
                    </ol>
                    {q.exp && <p className="qm-exp">{q.exp}</p>}
                    <div className="qm-acts">
                      <button type="button" className="qm-act btn-press" onClick={() => setEditing(q)}>Edit</button>
                      {actions.moveQuestions && <button type="button" className="qm-act btn-press" onClick={() => setMoving([q.id])}>Move to…</button>}
                      <button type="button" className="qm-act is-danger btn-press" onClick={() => remove([q.id])}>Delete</button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className={`qm-bar${picked.size ? " is-up" : ""}`} aria-hidden={!picked.size}>
          <span className="qm-bar-n">{picked.size} selected</span>
          <span className="qm-bar-acts">
            {actions.moveQuestions && <button type="button" className="qm-bar-btn btn-press" onClick={() => setMoving([...picked])} tabIndex={picked.size ? 0 : -1}>Move</button>}
            <button type="button" className="qm-bar-btn btn-press" onClick={() => remove([...picked])} tabIndex={picked.size ? 0 : -1}>Delete</button>
            <button type="button" className="qm-bar-x" onClick={() => setPicked(new Set())} aria-label="Clear selection" tabIndex={picked.size ? 0 : -1}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </span>
        </div>

        {moving && (
          <div className="qm-move" role="dialog" aria-label="Move to">
            <div className="qm-move-card">
              <p className="qm-move-title">Move {moving.length === 1 ? "this question" : `${moving.length} questions`} to</p>
              <ul className="qm-move-list">
                {destinations.map(({ d, depth }) => (
                  <li key={d.id}>
                    <button type="button" className="qm-move-row" style={{ paddingLeft: 12 + depth * 16 }} onClick={() => moveTo(d.id)}>
                      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 4.25a1 1 0 0 1 1-1h3.1l1.4 1.5h5.999a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                      <span>{d.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="qm-move-cancel" onClick={() => setMoving(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditQuestionModal
          q={editing}
          persist={editPersist ? updated => editPersist(updated, editing) : null}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); setVersion(v => v + 1); }}
        />
      )}
    </div>,
    document.body,
  );
}
