import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

const dialogBtn = { flex: 1, padding: "12px 18px", fontSize: 14.5, whiteSpace: "nowrap" };
import { deckShareUrl } from "../lib/decks";
import DeckTree from "./DeckTree";
import Popover, { MenuItems } from "./Popover";
import { confirmDelete } from "./Confirm";
import { C, card, primaryBtn, btnGhost } from "./theme";

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
 * What Share puts on screen after it has copied the link.
 *
 * It used to put nothing there: the clipboard was written and the menu item
 * read "Link copied" for 1.8 seconds, inside a menu that had already closed.
 * So the common outcome was pressing Share, seeing nothing happen, and not
 * knowing whether there was a link to paste.
 *
 * The link is shown instead, selectable, so a refused clipboard is no longer
 * a silent dead end.
 *
 * Shaped exactly like Confirm — the same card, buttons, sizes and scrim —
 * because it is the same kind of object and the app should only have one of
 * those. The first version invented its own and looked like it.
 */
function ShareSheet({ deck, url, copied, onCopy, onClose }) {
  return createPortal(
    <div
      role="dialog" aria-modal="true" aria-label={`Share ${deck.name}`}
      style={{
        position: "fixed", inset: 0, background: "rgba(26, 47, 122, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        backdropFilter: "blur(4px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="anim-scale-in" style={{ ...card, maxWidth: 400, width: "90%", padding: "32px 28px" }}>
        <div style={{ fontSize: 18, color: C.text, fontWeight: 600, letterSpacing: -0.3, overflowWrap: "anywhere" }}>
          Share “{deck.name}”
        </div>
        <div style={{ fontSize: 14, color: C.sub, marginTop: 8, marginBottom: 18, lineHeight: 1.55 }}>
          Anyone with this link can take their own copy. Yours stays as it is.
        </div>
        <input
          readOnly
          value={url}
          onFocus={e => e.target.select()}
          aria-label="Share link"
          style={{
            width: "100%", boxSizing: "border-box", padding: "12px 14px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13,
            color: C.text, background: "var(--c-surface2)",
            border: "1.5px solid var(--c-border)", borderRadius: "var(--r-ctrl)",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn-press" onClick={onCopy}
            style={{ ...primaryBtn, ...dialogBtn }}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <button type="button" className="btn-press" onClick={onClose}
            style={{ ...btnGhost, ...dialogBtn }}>
            Done
          </button>
        </div>
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
