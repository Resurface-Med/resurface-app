import { useEffect, useRef, useState, useCallback } from "react";
import { deckShareUrl } from "../lib/decks";
import DeckTree from "./DeckTree";
import Popover, { MenuItems } from "./Popover";
import { DeckPicker } from "./DeckBrowser";
import { confirmDelete } from "./Confirm";

/**
 * The tabs across the top of Study, and what a deck or folder can do.
 *
 * Tabs: All, then each of your roots, then New.
 *
 * What the controls offer depends on which kind you are looking at, because
 * the two can do different things and offering both to both is what made the
 * old menu unreadable. A folder can hold new decks and folders. A deck holds
 * questions, so it offers to add some. Both can be renamed, shared, moved
 * into a folder, and deleted.
 */

export function DeckTabs({ roots, activeId, onSelect, onNew }) {
  /* New has to ask which, now that a root can be either. Two items rather
     than one button, so you know what you are about to get before you name
     it — the old single "New" made an empty container you then had to work
     out what to do with, which is how an abandoned empty deck called
     "year 2" came to exist. */
  const [open, setOpen] = useState(false);
  const newRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const newItems = [
    { label: "New deck", onSelect: () => onNew(false) },
    { label: "New folder", onSelect: () => onNew(true) },
  ];
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
      <button ref={newRef} type="button" className="tg-tab tg-tab-new" aria-label="New"
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        New
      </button>
      <Popover anchorRef={newRef} open={open} onClose={close}>
        <MenuItems items={newItems} onPick={it => { setOpen(false); it.onSelect(); }} />
      </Popover>
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
export function DeckControls({ deck, decks: allDecks = [], actions, onGenerateInto, onNewSub, onRename, questionCount }) {
  const [copied, setCopied] = useState(false);
  const [moving, setMoving] = useState(false);
  const moveRef = useRef(null);
  async function share() {
    try { await navigator.clipboard.writeText(deckShareUrl(deck)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link", deckShareUrl(deck)); }
  }
  const isFolder = Boolean(deck.isFolder);
  /* A folder cannot hold questions and a deck cannot hold decks, so each one
     is offered only what it can actually do. */
  const addItems = isFolder
    ? [
        { label: "New deck", onSelect: () => onNewSub(deck.id, false) },
        { label: "New folder", onSelect: () => onNewSub(deck.id, true) },
      ]
    : [
        { label: "Add questions", onSelect: () => onGenerateInto(deck.id) },
      ];
  const n = questionCount;
  const menuItems = [
    { label: "Rename", onSelect: () => onRename(deck.id) },
    { label: "Move to a folder", onSelect: () => setMoving(true) },
    { label: copied ? "Link copied" : "Share", onSelect: share },
    { label: "Delete", danger: true, onSelect: async () => {
      if (await confirmDelete(`“${deck.name}”`, n)) actions.deleteDeck(deck.id);
    } },
  ];
  return (
    <span className="tg-controls">
      {/* A deck with one thing to add says so outright rather than opening a
          menu of one. */}
      {addItems.length === 1
        ? <button type="button" className="tg-menu-btn is-strong" onClick={addItems[0].onSelect}>
            <span aria-hidden="true">＋</span> {addItems[0].label}
          </button>
        : <Menu label={<><span aria-hidden="true">＋</span> Add</>} items={addItems} strong />}
      <span ref={moveRef} style={{ display: "inline-flex" }}>
        <Menu label="⋯" items={menuItems} />
      </span>
      <DeckPicker
        decks={allDecks} kind="folder" exclude={deck.id} current={deck.parentId ?? null}
        anchorRef={moveRef} open={moving} onClose={() => setMoving(false)}
        onPick={id => actions.moveDeck?.(deck.id, id)}
      />
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
