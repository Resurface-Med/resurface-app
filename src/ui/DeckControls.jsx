import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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

/**
 * Share.
 *
 * Three versions got here. First the clipboard was written silently and a
 * menu item said "Link copied" for 1.8 seconds inside a menu that had already
 * closed, so pressing Share looked like nothing happening. Then a dialog with
 * a heading, a paragraph about what a copy means and two buttons, which is a
 * lot of window for one URL — and the paragraph belonged on the recipient's
 * screen, since they are the one deciding. Then just a bare input and a
 * button, floating in a card with nothing to say what it was.
 *
 * This one: a title, one line of what the link does, the link, and Copy.
 * Which is what Notion, Linear and Figma all settled on, because there is
 * genuinely nothing else to put here.
 *
 * Copy confirms in place — the button becomes a tick and the field flashes
 * its border — because the whole fault in version one was that copying was
 * invisible.
 */
export function ShareSheet({ deck, url, copied, onCopy, onClose }) {
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
    && window.matchMedia?.("(max-width: 900px)").matches;
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="shr-scrim"
      role="dialog" aria-modal="true" aria-label={`Share ${deck.name}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="shr-card">
        <div className="shr-head">
          <h2 className="shr-title">Share deck</h2>
          <button type="button" className="shr-x" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="shr-sub">Anyone with the link can add <strong>{deck.name}</strong> to their own decks.</p>

        <div className={`shr-row${copied ? " is-copied" : ""}`}>
          <input
            readOnly
            value={url}
            autoFocus
            onFocus={e => e.target.select()}
            aria-label={`Link to ${deck.name}`}
            className="shr-link"
          />
          <button type="button" className="shr-copy btn-press" onClick={onCopy}>
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2 6.4L4.6 9 10 3.2" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : "Copy"}
          </button>
        </div>
        {/* Phones have their own share menu (Messages, WhatsApp, …); offer
            it where it exists. Cancelling it is not an error. */}
        {canShare && (
          <button
            type="button"
            className="shr-native btn-press"
            onClick={() => navigator.share({ title: deck.name, text: `${deck.name} on Resurface`, url }).catch(() => {})}
          >
            Send…
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The two controls beside a deck's heading. */
export function DeckControls({ deck, actions, onGenerateInto, onNewSub, onRename, questionCount }) {
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  /* Attempted, not required. A refused clipboard is not a failure here — the
     link is on screen to select — so it only decides what the button says. */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(deckShareUrl(deck));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* the sheet shows the link regardless */ }
  }
  async function share() {
    setSharing(true);
    copyLink();
  }
  const addItems = [
    { label: "Generate from a lecture", onSelect: () => onGenerateInto(deck.id) },
    { label: "New sub-deck", onSelect: () => onNewSub(deck.id) },
  ];
  const n = questionCount;
  const menuItems = [
    { label: "Rename", onSelect: () => onRename(deck.id) },
    { label: "Share", onSelect: share },
    { label: "Delete", danger: true, onSelect: async () => {
      if (await confirmDelete(`“${deck.name}”`, n)) actions.deleteDeck(deck.id);
    } },
  ];
  return (
    <span className="tg-controls">
      <Menu label={<><span aria-hidden="true">＋</span> Add</>} items={addItems} strong />
      <Menu label="⋯" items={menuItems} />
      {sharing && (
        <ShareSheet
          deck={deck}
          url={deckShareUrl(deck)}
          copied={copied}
          onCopy={copyLink}
          onClose={() => setSharing(false)}
        />
      )}
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
