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
 * lives, and a menu — Edit, Move to a deck, Delete. Search narrows by stem.
 */

/**
 * Pick somewhere to put something.
 *
 * It asks for one kind at a time, which is the whole point of there being
 * two. Moving a question offers decks, because a question cannot live in a
 * folder. Moving a deck or folder offers folders, because nothing else can
 * contain one. Before, one list offered every container for every job and
 * left you to work out which of the answers were real.
 *
 * Folders still show when picking a deck, greyed and unpickable, because
 * "Week 1" above "Upper Renal Tract" is how you tell which anatomy you meant.
 */
export function DeckPicker({ decks, kind = "deck", exclude = null, onPick, anchorRef, open, onClose, current = null }) {
  const rows = useMemo(() => {
    const out = [];
    const kids = pid => decks.filter(d => (d.parentId ?? null) === pid);
    /* Never offer something its own descendant: the database refuses to make
       a cycle, so offering it is offering an error. */
    const under = new Set();
    if (exclude) (function walk(id) { under.add(id); kids(id).forEach(d => walk(d.id)); })(exclude);
    (function walk(pid, depth) {
      for (const d of kids(pid)) {
        if (under.has(d.id)) continue;
        out.push({ id: d.id, name: d.name, depth, isFolder: Boolean(d.isFolder) });
        walk(d.id, depth + 1);
      }
    })(null, 0);
    return out;
  }, [decks, exclude]);

  const wantFolders = kind === "folder";
  const shown = wantFolders ? rows.filter(r => r.isFolder) : rows;
  const pickable = shown.filter(r => wantFolders || !r.isFolder);

  const items = [
    ...(wantFolders ? [{ label: "No folder", onSelect: () => onPick(null), disabled: current === null }] : []),
    ...shown.map(r => ({
      label: `${"   ".repeat(r.depth)}${r.name}`,
      onSelect: () => onPick(r.id),
      /* a folder in a deck list is there to be read, not chosen */
      disabled: r.id === current || (!wantFolders && r.isFolder),
    })),
  ];

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose}>
      <div className="pop-title">{wantFolders ? "Move to folder" : "Move to deck"}</div>
      {pickable.length === 0 && (
        <div className="pop-empty">{wantFolders ? "No folders yet." : "No other deck to move it to."}</div>
      )}
      <MenuItems items={items} onPick={it => { onClose(); it.onSelect(); }} />
    </Popover>
  );
}

function QuestionRow({ q, decks, actions, onEdit }) {
  const [open, setOpen] = useState(false);
  /* The picker is its own popover anchored to the same button, so it opens
     where the menu was rather than somewhere else on the screen. */
  const [moving, setMoving] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const where = q.path?.slice(1).map(p => p.name).join(" › ") || q.path?.[0]?.name || "";
  const items = [
    { label: "Edit", onSelect: () => onEdit(q) },
    { label: "Move to a deck", onSelect: () => setMoving(true) },
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
      <DeckPicker
        decks={decks} kind="deck" current={q.leaf ?? null}
        anchorRef={ref} open={moving} onClose={() => setMoving(false)}
        onPick={id => actions.moveQuestion?.(q.id, id)}
      />
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
