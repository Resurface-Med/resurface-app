import { useEffect, useRef, useState, useCallback } from "react";
import { deckShareUrl } from "../lib/decks";
import DeckTree from "./DeckTree";
import Popover, { MenuItems } from "./Popover";
import { confirmDelete } from "./Confirm";

/**
 * The tabs across the top of Study, and what a deck of yours can do.
 *
 * Tabs: All, then every deck of yours, then New. A deck has two controls:
 * Add (a lecture, or a sub-deck) and a menu (Rename, Share, Delete).
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
          className={`tg-tab${r.id === activeId ? " is-active" : ""}`}
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
  const close = useCallback(() => setOpen(false), []);
  return (
    <span className="tg-menu">
      <button ref={ref} type="button" className={`tg-menu-btn${strong ? " is-strong" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {label}
      </button>
      <Popover anchorRef={ref} open={open} onClose={close} align={align}>
        <MenuItems items={items} onPick={it => { setOpen(false); it.onSelect(); }} />
      </Popover>
    </span>
  );
}

/** The two controls beside a deck's heading. */
export function DeckControls({ deck, actions, onGenerateInto, onNewSub, onRename, questionCount }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try { await navigator.clipboard.writeText(deckShareUrl(deck)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link", deckShareUrl(deck)); }
  }
  const addItems = [
    { label: "Generate from a lecture", onSelect: () => onGenerateInto(deck.id) },
    { label: "New sub-deck", onSelect: () => onNewSub(deck.id) },
  ];
  const n = questionCount;
  const menuItems = [
    { label: "Rename", onSelect: () => onRename(deck.id) },
    { label: copied ? "Link copied" : "Share", onSelect: share },
    { label: "Delete", danger: true, onSelect: async () => {
      if (await confirmDelete(`“${deck.name}”`, n)) actions.deleteDeck(deck.id);
    } },
  ];
  return (
    <span className="tg-controls">
      <Menu label={<><span aria-hidden="true">＋</span> Add</>} items={addItems} strong />
      <Menu label="⋯" items={menuItems} />
    </span>
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
