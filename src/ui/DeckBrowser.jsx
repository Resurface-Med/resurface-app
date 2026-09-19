import { useMemo, useRef, useState, useCallback } from "react";
import { questionsInDeck, deckPath, indexDecks } from "../lib/decks";
import Popover, { MenuItems } from "./Popover";
import EditQuestionModal from "./EditQuestionModal";
import { confirm } from "./Confirm";

/**
 * The questions in a deck, in place.
 *
 * Anki keeps these in a separate Browse window; here the list replaces
 * the tree while you look. One row per question: the stem, where it
 * lives, and a menu — Edit, Move to…, Delete. Search narrows by stem.
 */

/** A list of your decks to pick from, indented by depth. */
export function DeckPicker({ decks, exclude = null, allowTop = false, onPick, anchorRef, open, onClose, current = null }) {
  const options = useMemo(() => {
    const out = [];
    const kids = pid => decks.filter(d => (d.parentId ?? null) === pid);
    const under = new Set();
    if (exclude) (function walk(id) { under.add(id); kids(id).forEach(d => walk(d.id)); })(exclude);
    (function walk(pid, depth) {
      for (const d of kids(pid)) {
        if (under.has(d.id)) continue;
        out.push({ id: d.id, name: d.name, depth });
        walk(d.id, depth + 1);
      }
    })(null, 0);
    return out;
  }, [decks, exclude]);
  const items = [
    ...(allowTop ? [{ label: "Top level", onSelect: () => onPick(null), disabled: current === null }] : []),
    ...options.map(o => ({ label: `${"   ".repeat(o.depth)}${o.name}`, onSelect: () => onPick(o.id), disabled: o.id === current })),
  ];
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose}>
      <div className="pop-title">Move into</div>
      {items.length === 0 && <div className="pop-empty">No other deck yet.</div>}
      <MenuItems items={items} onPick={it => { onClose(); it.onSelect(); }} />
    </Popover>
  );
}

function QuestionRow({ q, decks, actions, onEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const where = q.path?.slice(1).map(p => p.name).join(" › ") || q.path?.[0]?.name || "";
  const items = [
    { label: "Edit", onSelect: () => onEdit(q) },
    { label: "Delete", danger: true, onSelect: async () => {
      if (await confirm({ title: "Delete this question?", body: "This can’t be undone.", action: "Delete", danger: true })) actions.deleteQuestion(q.id);
    } },
  ];
  return (
    <li className="qb-row">
      <span className="qb-body">
        <span className="qb-stem">{q.q}</span>
        <span className="qb-meta">{where}</span>
      </span>
      <button ref={ref} type="button" className="deck-menu-btn" aria-label="Options" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>⋯</button>
      <Popover anchorRef={ref} open={open} onClose={close}>
        <MenuItems items={items} onPick={it => { setOpen(false); it.onSelect(); }} />
      </Popover>
    </li>
  );
}

export default function DeckBrowser({ deckId, decks, actions, query, onDone, onSaveEdit }) {
  const byId = useMemo(() => indexDecks(decks), [decks]);
  const deck = byId.get(deckId);
  const [editing, setEditing] = useState(null);
  const qs = useMemo(() => questionsInDeck(deckId).filter(q => q.gen), [deckId, decks]);
  const q = query.trim().toLowerCase();
  const shown = q ? qs.filter(x => x.q.toLowerCase().includes(q)) : qs;
  const title = deckPath(deckId, byId).map(p => p.name).join(" › ");

  return (
    <div className="qb">
      <div className="tg-source">
        <span className="tg-source-note">{shown.length} of {qs.length} question{qs.length === 1 ? "" : "s"} in <strong>{title}</strong></span>
        <button type="button" className="gen-link tg-source-done" onClick={onDone}>Done</button>
      </div>
      {qs.length === 0 ? (
        <div className="tg-rows-empty">No questions in {deck?.name ?? "this deck"} yet.</div>
      ) : shown.length === 0 ? (
        <div className="tg-rows-empty">Nothing matches “{query.trim()}”.</div>
      ) : (
        <ol className="qb-list">
          {shown.map(x => <QuestionRow key={x.id} q={x} decks={decks} actions={actions} onEdit={setEditing} />)}
        </ol>
      )}
      {editing && (
        <EditQuestionModal q={editing} onClose={() => setEditing(null)} onSave={u => { setEditing(null); onSaveEdit?.(u); }} />
      )}
    </div>
  );
}
