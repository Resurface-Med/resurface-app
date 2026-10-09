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
 * lives, and a menu — Edit, Delete. Search narrows by stem.
 *
 * There is no Move. A DeckPicker lived here, exported and documented as the
 * way to move a question, and was imported by nothing — `moveQuestion` and
 * `moveDeck` sit in App.jsx and no component has ever called them. It is
 * deleted rather than left looking available.
 */


function QuestionRow({ q, actions, onEdit }) {
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
