import { useEffect, useRef, useState } from "react";
import { BANK_ROOT, deckShareUrl } from "../lib/decks";
import DeckTree from "./DeckTree";

/**
 * The tabs across the top of Study, and what a deck of yours can do.
 *
 * Tabs: All, then every root deck — yours first, the bank last — then New.
 * A deck of yours has two controls, like a deck anywhere: Add (a lecture,
 * a sub-deck, or topics copied from the bank) and a menu (Rename, Share,
 * Delete). The bank has neither; it is read-only.
 */

export function DeckTabs({ roots, activeId, onSelect, onNew }) {
  return (
    <div className="tg-tabs" role="tablist" aria-label="Decks">
      <button type="button" role="tab" aria-selected={activeId === null}
        className={`tg-tab${activeId === null ? " is-active" : ""}`} onClick={() => onSelect(null)}>
        All
      </button>
      {roots.map(r => (
        <button key={r.id} type="button" role="tab" aria-selected={r.id === activeId}
          className={`tg-tab${r.id === activeId ? " is-active" : ""}${r.id === BANK_ROOT ? " is-bank" : ""}`}
          onClick={() => onSelect(r.id)}>
          {r.name}
        </button>
      ))}
      <button type="button" className="tg-tab tg-tab-new" onClick={onNew} aria-label="New deck">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        New
      </button>
    </div>
  );
}

/** A small menu anchored to a text control. */
export function Menu({ label, items, strong = false, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span className="tg-menu" ref={ref}>
      <button type="button" className={`tg-menu-btn${strong ? " is-strong" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {label}
      </button>
      {open && (
        <span className={`tg-menu-pop anim-scale-in is-${align}`} role="menu">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" className={`tg-menu-item${it.danger ? " is-danger" : ""}`}
              onClick={() => { setOpen(false); it.onSelect(); }}>
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** The two controls beside a deck's heading. */
export function DeckControls({ node, deck, actions, onGenerateInto, onNewSub, onCopyFromBank, onRename, questionCount }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try { await navigator.clipboard.writeText(deckShareUrl(deck)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link", deckShareUrl(deck)); }
  }
  const addItems = [
    { label: "Generate from a lecture", onSelect: () => onGenerateInto(deck.id) },
    { label: "New sub-deck", onSelect: () => onNewSub(deck.id) },
    { label: "Copy from ARU Year 1", onSelect: () => onCopyFromBank(deck.id) },
  ];
  const n = questionCount;
  const menuItems = [
    { label: "Rename", onSelect: () => onRename(deck.id) },
    { label: copied ? "Link copied" : "Share", onSelect: share },
    { label: "Delete", danger: true, onSelect: () => {
      if (window.confirm(n ? `Delete “${deck.name}” and its ${n} question${n === 1 ? "" : "s"}?` : `Delete “${deck.name}”?`)) actions.deleteDeck(deck.id);
    } },
  ];
  return (
    <span className="tg-controls">
      <Menu label={<><span aria-hidden="true">＋</span> Add</>} items={addItems} strong />
      <Menu label="⋯" items={menuItems} />
    </span>
  );
}

/**
 * Copying from the bank: a tree of ARU Year 1 with ticks. Each ticked topic
 * becomes a sub-deck of the target with a copy of its questions — a real
 * copy, yours to keep. Done applies it.
 */
export function BankCopier({ bankForest, query, onDone, onCancel }) {
  const [value, setValue] = useState({ leaves: ["nothing"] });
  const leaves = value.leaves.includes("All") ? null : value.leaves.filter(l => l !== "nothing");
  return (
    <div className="tg-adding">
      <div className="tg-source">
        <span className="tg-source-note">Tick topics to copy into this deck.</span>
        <button type="button" className="gen-link tg-source-done" disabled={!leaves || !leaves.length} onClick={() => onDone(leaves)}>
          {leaves && leaves.length ? `Copy ${leaves.length} topic${leaves.length === 1 ? "" : "s"}` : "Copy"}
        </button>
        <button type="button" className="gen-link tg-cancel" onClick={onCancel}>Cancel</button>
      </div>
      <DeckTree forest={bankForest} value={value} onChange={setValue} query={query} showAll={false} />
    </div>
  );
}

/** A name field for a new or renamed deck. */
export function DeckNameForm({ onSubmit, onCancel, initial = "", placeholder = "Name the deck — “Week 3”, “Cardio”, “Keeps going wrong”" }) {
  const [name, setName] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  function submit(e) {
    e.preventDefault();
    const n = name.trim();
    if (n) onSubmit(n);
  }
  return (
    <form className="tg-new" onSubmit={submit}>
      <input ref={ref} value={name} onChange={e => setName(e.target.value)} placeholder={placeholder} maxLength={80} aria-label="Deck name" />
      <button type="submit" className="gen-link" disabled={!name.trim()}>{initial ? "Save" : "Create"}</button>
      <button type="button" className="gen-link tg-cancel" onClick={onCancel}>Cancel</button>
    </form>
  );
}
