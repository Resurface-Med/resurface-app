import { useMemo, useState } from "react";
import Popover from "./Popover";
import { compareDecks } from "../lib/deckOrder";

/**
 * Where generated questions go, as one line: the folder they go in, then the
 * lecture's own deck — like a path bar.
 *
 *   Decks › Year 2 › Week 1 – Renal › ＋ › [Upper Renal Tract]
 *
 * Each folder is a chip; tapping it lists the other decks at that level to
 * swap to, or to stop there. ＋ goes a level deeper or makes a new folder.
 * The last chip is the lecture's own deck, named after the file and renamed
 * by tapping it. A lecture always gets its own deck: questions never sit
 * loose in a folder (Rafil, 2026-10-17). For a batch the last chip is the
 * number of lectures — each becomes its own deck inside the folder.
 *
 * Replaced a "::" text field with suggestions and a Browse modal, then a
 * full tree with a flying card that was too big (2026-10-17).
 */
const split = v => String(v ?? "").split("::").map(x => x.trim()).filter(Boolean);

const Folder = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 4.25a1 1 0 0 1 1-1h3.1l1.4 1.5h5.999a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const Doc = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.25L12.5 5v9.25H4V1.75Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9 1.75V5.25h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);

export default function DeckPath({ decks, folderPath, onFolderPath, lectureName, onLectureName, batchCount = 0, countFor }) {
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

  /* The folder path, read back as decks where they exist. Anything after
     the last real one is a folder still to be made. */
  const names = split(folderPath);
  const levels = [];                       // [{ name, id|null, parentId|null }]
  let parent = null, real = true;
  for (const name of names) {
    const hit = real ? (kids.get(parent) ?? []).find(d => d.name.trim().toLowerCase() === name.toLowerCase()) : null;
    levels.push({ name, id: hit?.id ?? null, parentId: parent });
    if (!hit) real = false;
    parent = hit?.id ?? null;
  }
  const lastId = levels.length ? levels[levels.length - 1].id : null;

  const [menu, setMenu] = useState(null);   // level index, "deeper", or null
  const [newFolder, setNewFolder] = useState("");
  const [renaming, setRenaming] = useState(false);
  /* The chip a menu was opened from, for the Popover to sit against. */
  const [anchor, setAnchor] = useState(null);
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);
  const toggle = k => e => { const el = e.currentTarget; setMenu(m => (m === k ? null : k)); setAnchor(el); };

  const setLevels = list => { onFolderPath(list.join("::")); setMenu(null); };
  const keep = i => names.slice(0, i);

  function options(atLevel) {
    const parentId = atLevel === "deeper" ? lastId : levels[atLevel].parentId;
    const list = atLevel === "deeper" && levels.length && !lastId ? [] : (kids.get(parentId) ?? []);
    const base = atLevel === "deeper" ? names : keep(atLevel);
    const here = atLevel === "deeper" ? null : levels[atLevel].id;
    return (
      <div className="dpm" onClick={e => e.stopPropagation()}>
        <div className="dpm-list" role="listbox">
          {list.map(d => {
            const n = countFor?.(d.id) ?? 0;
            const sub = (kids.get(d.id) ?? []).length;
            return (
              <button key={d.id} type="button" role="option" aria-selected={d.id === here}
                className={`dpm-item${d.id === here ? " is-here" : ""}`}
                onClick={() => setLevels([...base, d.name])}>
                <Folder />
                <span className="dpm-name">{d.name}</span>
                <span className="dpm-meta">{sub ? `${sub} deck${sub === 1 ? "" : "s"}` : n ? `${n}` : ""}</span>
              </button>
            );
          })}
          {atLevel !== "deeper" && (
            <button type="button" className="dpm-item dpm-out" onClick={() => setLevels(base)}>
              {atLevel === 0 ? "Not in a folder" : `Straight into ${names[atLevel - 1]}`}
            </button>
          )}
        </div>
        <form className="dpm-new" onSubmit={e => { e.preventDefault(); const n = newFolder.trim(); if (n) { setLevels([...base, n]); setNewFolder(""); } }}>
          <input value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="New folder" aria-label="New folder name" maxLength={80} />
          <button type="submit" disabled={!newFolder.trim()} aria-label="Add folder">＋</button>
        </form>
      </div>
    );
  }

  return (
    <div className="dpath">
      <div className="dpath-row">
        <button type="button" className="dpath-home" onClick={() => setLevels([])} aria-label="Top level" title="Top level">
          Decks
        </button>
        {levels.map((l, i) => (
          <span key={names.slice(0, i + 1).join("::")} className="dpath-step">
            <span className="dpath-sep" aria-hidden="true">›</span>
            <button type="button" className={`dpath-chip${l.id ? "" : " is-new"}`} aria-expanded={menu === i}
              onClick={toggle(i)}>
              <Folder /><span className="dpath-chip-name">{l.name}</span>
            </button>
          </span>
        ))}
        {/* Deeper: into one of the last folder's own, or a new one. Not past
            a folder that is itself still to be made. */}
        {(levels.length === 0 || lastId) && (
          <span className="dpath-step">
            <span className="dpath-sep" aria-hidden="true">›</span>
            <button type="button" className="dpath-more" aria-expanded={menu === "deeper"}
              aria-label={levels.length ? "Put it in a folder inside" : "Put it in a folder"}
              onClick={toggle("deeper")}>
              {levels.length ? "＋" : "＋ Folder"}
            </button>
          </span>
        )}
        <span key={`lecture:${folderPath}`} className="dpath-step dpath-step--lecture">
          <span className="dpath-sep" aria-hidden="true">›</span>
          {batchCount > 1 ? (
            <span className="dpath-lecture"><Doc /><span className="dpath-chip-name">{batchCount} lectures, a deck each</span></span>
          ) : renaming ? (
            <input className="dpath-lecture dpath-lecture-input" autoFocus defaultValue={lectureName}
              onFocus={e => e.target.select()}
              onBlur={e => { onLectureName(e.target.value.trim() || lectureName); setRenaming(false); }}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
              maxLength={80} aria-label="Name of this lecture's deck" />
          ) : (
            <button type="button" className={`dpath-lecture${lectureName ? "" : " is-empty"}`} onClick={() => setRenaming(true)} title="Rename">
              <Doc /><span className="dpath-chip-name">{lectureName || "Name this deck"}</span>
              <svg className="dpath-pen" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.6 2.1l2.3 2.3L4.2 10.1H1.9V7.8l5.7-5.7Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
            </button>
          )}
        </span>
      </div>

      <Popover anchorRef={anchorRef} open={menu !== null} onClose={() => setMenu(null)} align="left" className="dpm-pop">
        {menu !== null && options(menu)}
      </Popover>
    </div>
  );
}
