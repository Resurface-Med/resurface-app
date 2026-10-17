import { useMemo, useState } from "react";
import Popover from "./Popover";
import { compareDecks } from "../lib/deckOrder";

/**
 * Where generated questions go: a folder, and the lecture's own deck hanging
 * off it.
 *
 *   📁  Year 2 › Week 1 – Renal                 Change
 *    └─ 📄  Renal History Taking                    ✎
 *
 * Two rows, each one line, the second joined to the first so "this goes in
 * that" is the shape of the thing rather than a sentence about it. The folder
 * row opens a menu walked like iOS settings: tap a deck to choose it, its
 * arrow to look inside, back to go up, and a new folder at the bottom. The
 * deck row is renamed in place. A lecture always gets its own deck — never
 * questions loose in a folder (Rafil, 2026-10-17); a batch gets one each.
 *
 * Third version on 2026-10-17: a "::" field, then a big tree with a flying
 * card, then chips that wrapped onto two lines and still read as a puzzle.
 */
const split = v => String(v ?? "").split("::").map(x => x.trim()).filter(Boolean);

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 4.25a1 1 0 0 1 1-1h3.1l1.4 1.5h5.999a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const DocIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.25L12.5 5v9.25H4V1.75Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9 1.75V5.25h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const Chevron = ({ left = false }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={left ? { transform: "scaleX(-1)" } : undefined}><path d="M5.25 3 9 7l-3.75 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function DeckPath({ decks, folderPath, onFolderPath, lectureName, onLectureName, batchCount = 0, countFor }) {
  const byId = useMemo(() => new Map(decks.map(d => [d.id, d])), [decks]);
  const kids = useMemo(() => {
    const m = new Map();
    for (const d of decks) {
      const p = d.parentId ?? null;
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(d);
    }
    for (const list of m.values()) list.sort(compareDecks);
    return m;
  }, [decks]);
  const pathOf = id => {
    const out = [];
    for (let d = byId.get(id); d; d = byId.get(d.parentId)) out.unshift(d.name);
    return out;
  };

  /* The folder, as the deck it names when every level of it exists. */
  const names = split(folderPath);
  let folderId = null;
  for (const name of names) {
    const hit = (kids.get(folderId) ?? []).find(d => d.name.trim().toLowerCase() === name.toLowerCase());
    if (!hit) { folderId = undefined; break; }
    folderId = hit.id;
  }
  const shown = names.length > 2 ? ["…", ...names.slice(-2)] : names;

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);
  /* The level the menu is showing, and which way it last moved. */
  const [at, setAt] = useState(null);
  const [dir, setDir] = useState(1);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);

  function openMenu(e) {
    setAnchor(e.currentTarget);
    /* Opens on the level the current folder sits in, so it is in view. */
    setAt(folderId ? (byId.get(folderId)?.parentId ?? null) : null);
    setDir(1);
    setOpen(o => !o);
  }
  const into = id => { setDir(1); setAt(id); };
  const up = () => { setDir(-1); setAt(byId.get(at)?.parentId ?? null); };
  const choose = path => { onFolderPath(path.join("::")); setOpen(false); setDraft(""); };

  const level = kids.get(at) ?? [];

  return (
    <div className="dp2">
      <button type="button" className="dp2-folder" aria-expanded={open} onClick={openMenu}>
        <span className="dp2-icon"><FolderIcon /></span>
        <span className="dp2-folder-path">
          {names.length ? shown.map((n, i) => (
            <span key={`${i}:${n}`} className="dp2-crumb">
              {i > 0 && <span className="dp2-sep" aria-hidden="true">›</span>}
              <span className={i === shown.length - 1 ? "dp2-crumb-last" : "dp2-crumb-name"}>{n}</span>
            </span>
          )) : <span className="dp2-none">No folder</span>}
        </span>
        <span className="dp2-change">{names.length ? "Change" : "Choose"}</span>
      </button>

      <div key={`deck:${folderPath}`} className="dp2-deck">
        <svg className="dp2-elbow" width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M3 0v13a6 6 0 0 0 6 6h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        {batchCount > 1 ? (
          <span className="dp2-lecture is-batch"><DocIcon /><span className="dp2-lecture-name">{batchCount} lectures, a deck each</span></span>
        ) : renaming ? (
          <span className="dp2-lecture is-editing">
            <DocIcon />
            <input className="dp2-lecture-input" autoFocus defaultValue={lectureName}
              onFocus={e => e.target.select()}
              onBlur={e => { onLectureName(e.target.value.trim() || lectureName); setRenaming(false); }}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
              maxLength={80} aria-label="Name of this lecture's deck" />
          </span>
        ) : (
          <button type="button" className={`dp2-lecture${lectureName ? "" : " is-empty"}`} onClick={() => setRenaming(true)} title="Rename">
            <DocIcon />
            <span className="dp2-lecture-name">{lectureName || "Name this lecture’s deck"}</span>
            <svg className="dp2-pen" width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.6 2.1l2.3 2.3L4.2 10.1H1.9V7.8l5.7-5.7Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>

      <Popover anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} align="left" className="dp2-pop">
        <div className="dp2-menu" onClick={e => e.stopPropagation()}>
          <div className="dp2-menu-head">
            {at !== null ? (
              <button type="button" className="dp2-back" onClick={up} aria-label="Up a level"><Chevron left /></button>
            ) : <span className="dp2-back-gap" />}
            <span className="dp2-menu-title">{at !== null ? byId.get(at)?.name : "Your decks"}</span>
          </div>
          <div key={String(at)} className="dp2-level" style={{ "--dir": dir }} role="listbox">
            {at === null ? (
              <button type="button" className={`dp2-opt${names.length === 0 ? " is-here" : ""}`} onClick={() => choose([])}>
                <span className="dp2-opt-icon"><DocIcon /></span>
                <span className="dp2-opt-name">No folder</span>
              </button>
            ) : (
              /* Choosing a folder you have opened is its own, plain action at
                 the top — opening it is not choosing it. */
              <button type="button" className="dp2-here-btn" onClick={() => choose(pathOf(at))}>
                Put it in {byId.get(at)?.name}
              </button>
            )}
            {level.map(d => {
              const sub = (kids.get(d.id) ?? []).length;
              const n = countFor?.(d.id) ?? 0;
              return (
                /* A folder with decks inside opens on tap, the way iOS lists do,
                   so you see what is in it before choosing; one with none is
                   chosen. Tapping Year 2 used to choose it outright, when what
                   was wanted was a deck inside it (Rafil, 2026-10-17). */
                <span key={d.id} className={`dp2-opt-row${folderId === d.id ? " is-here" : ""}`}>
                  <button type="button" className="dp2-opt" onClick={() => (sub ? into(d.id) : choose(pathOf(d.id)))}>
                    <span className="dp2-opt-icon"><FolderIcon /></span>
                    <span className="dp2-opt-name">{d.name}</span>
                    <span className="dp2-opt-meta">{sub ? `${sub} inside` : n ? `${n} q` : ""}</span>
                    {sub > 0 && <span className="dp2-in"><Chevron /></span>}
                  </button>
                </span>
              );
            })}
          </div>
          <form className="dp2-new" onSubmit={e => { e.preventDefault(); const n = draft.trim(); if (n) choose([...(at !== null ? pathOf(at) : []), n]); }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={at !== null ? `New folder in ${byId.get(at)?.name}` : "New folder"} aria-label="New folder name" maxLength={80} />
            <button type="submit" disabled={!draft.trim()} aria-label="Make folder">＋</button>
          </form>
        </div>
      </Popover>
    </div>
  );
}
