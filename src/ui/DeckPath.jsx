import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compareDecks } from "../lib/deckOrder";

/**
 * Where generated questions go — shown, not asked.
 *
 * Collapsed, two lines: the folder, and the lecture's own deck hanging off
 * it. Tap the folder and it opens in place into columns, Finder-style, with
 * the lecture already sitting in the open folder as a "ghost" deck among the
 * decks that are there. Tap a folder and a column slides in with the ghost
 * gliding into it; tap one further left and it glides back. Where the ghost
 * is, is the choice — there is nothing to confirm. Tap an existing lecture's
 * deck (one with nothing inside) and the ghost merges into it: more
 * questions for that lecture, avoiding the ones it has. "＋ Folder" in any
 * column makes one there and moves the ghost in; search jumps anywhere. On a
 * phone the columns are one panel that pushes and pops like iOS.
 *
 * A lecture always gets its own deck — never loose in a folder (Rafil,
 * 2026-10-17). Fourth design that day, after a "::" field, a big tree, chips
 * that wrapped, and a drill-down menu that chose a folder when you meant to
 * open it.
 */
const split = v => String(v ?? "").split("::").map(x => x.trim()).filter(Boolean);
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 4.25a1 1 0 0 1 1-1h3.1l1.4 1.5h5.999a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const DocIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.25L12.5 5v9.25H4V1.75Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9 1.75V5.25h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const Chevron = ({ left = false }) => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" style={left ? { transform: "scaleX(-1)" } : undefined}><path d="M5.25 3 9 7l-3.75 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Pen = () => (
  <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.6 2.1l2.3 2.3L4.2 10.1H1.9V7.8l5.7-5.7Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
);

function useNarrow() {
  const q = "(max-width: 600px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

export default function DeckPath({ decks, folderPath, onFolderPath, lectureName, onLectureName, batchCount = 0, countFor }) {
  const batch = batchCount > 1;
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
  const hasKids = id => (kids.get(id) ?? []).length > 0;

  /* The folder path as levels: real decks while they exist, then folders
     still to be made (id null). */
  const names = split(folderPath);
  const levels = [];
  let parent = null, real = true;
  for (const name of names) {
    const hit = real ? (kids.get(parent) ?? []).find(d => same(d.name, name)) : null;
    levels.push({ name, id: hit?.id ?? null });
    if (!hit) real = false;
    parent = hit?.id ?? null;
  }
  const lastId = levels.length ? levels[levels.length - 1].id : null;
  const lastReal = levels.length === 0 || lastId !== null;
  /* Merged: the lecture's name is a deck already in the folder, so the
     questions go into that deck rather than a new one. */
  const mergedId = !batch && lastReal && lectureName
    ? (kids.get(lastId) ?? []).find(d => same(d.name, lectureName))?.id ?? null
    : null;

  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(null);       // column index taking a new folder name
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const narrow = useNarrow();
  /* The lecture's own name, to go back to after merging into another. */
  const ownName = useRef(lectureName);
  useEffect(() => { if (!mergedId && lectureName) ownName.current = lectureName; }, [lectureName, mergedId]);

  function goTo(path) {
    onFolderPath(path.join("::"));
    if (mergedId) onLectureName(ownName.current);
    setAdding(null);
  }
  function tapDeck(d) {
    if (hasKids(d.id) || batch) { goTo(pathOf(d.id)); return; }
    /* An existing lecture's deck: add to it. */
    onFolderPath(pathOf(d.id).slice(0, -1).join("::"));
    onLectureName(d.name);
    setAdding(null);
  }
  function addFolder(col) {
    const n = draft.trim();
    setAdding(null); setDraft("");
    if (!n) return;
    goTo([...names.slice(0, col), n]);
  }

  /* The ghost glides from wherever it was to wherever it now is: its last
     position is kept, and on the next layout it is animated from there. */
  const ghostRef = useRef(null);
  const lastRect = useRef(null);
  const colsRef = useRef(null);
  const placeKey = `${folderPath}|${mergedId ?? ""}|${open}`;
  useLayoutEffect(() => {
    const el = ghostRef.current;
    const from = lastRect.current;
    const to = el?.getBoundingClientRect() ?? null;
    if (el && from && to && open && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const dx = from.left - to.left, dy = from.top - to.top;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        el.animate([
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0, 0)" },
        ], { duration: 420, easing: "cubic-bezier(0.34, 1.25, 0.5, 1)" });
      }
    }
    lastRect.current = to;
    /* The newest column in view. */
    const c = colsRef.current;
    if (c) c.scrollTo({ left: c.scrollWidth, behavior: "smooth" });
  }, [placeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ghost = (
    <li className="cb-item">
      <span ref={ghostRef} className={`cb-ghost${renaming ? " is-editing" : ""}`}>
        <DocIcon />
        {batch ? <span className="cb-ghost-name">{batchCount} lectures, a deck each</span>
          : renaming ? (
            <input className="cb-ghost-input" autoFocus defaultValue={lectureName}
              onFocus={e => e.target.select()}
              onBlur={e => { onLectureName(e.target.value.trim() || lectureName); setRenaming(false); }}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
              maxLength={80} aria-label="Name of this lecture's deck" />
          ) : (
            <button type="button" className="cb-ghost-name" onClick={() => setRenaming(true)} title="Rename">
              {lectureName || "Name this lecture’s deck"}
            </button>
          )}
        {!batch && !renaming && <span className="cb-ghost-tag">new</span>}
        {!batch && !renaming && <button type="button" className="cb-ghost-pen" onClick={() => setRenaming(true)} aria-label="Rename"><Pen /></button>}
      </span>
    </li>
  );

  /* Column `c` shows what is inside level c-1 (or the top level). */
  function column(c) {
    const pid = c === 0 ? null : levels[c - 1].id;
    const list = pid === null && c > 0 ? [] : (kids.get(pid) ?? []);
    const isLast = c === levels.length;
    const title = c === 0 ? "Your decks" : levels[c - 1].name;
    return (
      <div key={`${c}:${title}`} className={`cb-col${isLast ? " is-last" : ""}`}>
        <div className="cb-col-head">
          {narrow && c > 0 && (
            <button type="button" className="cb-back" onClick={() => goTo(names.slice(0, c - 1))} aria-label="Up a level"><Chevron left /></button>
          )}
          <span className="cb-col-title">{title}</span>
        </div>
        <ul className="cb-list">
          {list.map(d => {
            const folder = hasKids(d.id);
            const onPath = levels[c]?.id === d.id;
            const merged = mergedId === d.id;
            const n = countFor?.(d.id) ?? 0;
            return (
              <li key={d.id} className="cb-item">
                {merged ? (
                  <span ref={ghostRef} className="cb-ghost is-merged">
                    <DocIcon />
                    <span className="cb-ghost-name">{d.name}</span>
                    <span className="cb-ghost-tag">adding to · {n}</span>
                  </span>
                ) : (
                  <button type="button" className={`cb-row${onPath ? " is-on" : ""}`} onClick={() => tapDeck(d)}>
                    <span className="cb-row-icon">{folder ? <FolderIcon /> : <DocIcon />}</span>
                    <span className="cb-row-name">{d.name}</span>
                    <span className="cb-row-meta">{folder ? "" : n ? n : ""}</span>
                    {folder && <span className="cb-row-go"><Chevron /></span>}
                  </button>
                )}
              </li>
            );
          })}
          {/* A folder still to be made, shown where it will be. */}
          {levels[c] && levels[c].id === null && (
            <li className="cb-item">
              <button type="button" className="cb-row is-on is-new">
                <span className="cb-row-icon"><FolderIcon /></span>
                <span className="cb-row-name">{levels[c].name}</span>
                <span className="cb-row-meta">new</span>
                <span className="cb-row-go"><Chevron /></span>
              </button>
            </li>
          )}
          {isLast && !mergedId && ghost}
          <li className="cb-item">
            {adding === c ? (
              <form className="cb-new" onSubmit={e => { e.preventDefault(); addFolder(c); }}>
                <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => addFolder(c)}
                  onKeyDown={e => { if (e.key === "Escape") { setAdding(null); setDraft(""); } }}
                  placeholder="Folder name" maxLength={80} aria-label="New folder name" />
              </form>
            ) : (
              <button type="button" className="cb-add" onClick={() => { setAdding(c); setDraft(""); }}>＋ Folder</button>
            )}
          </li>
        </ul>
      </div>
    );
  }

  /* Search: any deck that can hold the lecture, with where it is. */
  const needle = q.trim().toLowerCase();
  const results = needle
    ? decks.filter(d => d.name.toLowerCase().includes(needle)).slice(0, 8).map(d => ({ d, path: pathOf(d.id) }))
    : [];

  const shown = names.length > 2 ? ["…", ...names.slice(-2)] : names;
  const cols = Array.from({ length: levels.length + 1 }, (_, c) => c);

  return (
    <div className={`dp2${open ? " is-open" : ""}`}>
      <button type="button" className="dp2-folder" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="dp2-icon"><FolderIcon /></span>
        <span className="dp2-folder-path">
          {names.length ? shown.map((n, i) => (
            <span key={`${i}:${n}`} className="dp2-crumb">
              {i > 0 && <span className="dp2-sep" aria-hidden="true">›</span>}
              <span className={i === shown.length - 1 ? "dp2-crumb-last" : "dp2-crumb-name"}>{n}</span>
            </span>
          )) : <span className="dp2-none">No folder</span>}
        </span>
        <span className="dp2-change">{open ? "Done" : names.length ? "Change" : "Choose"}</span>
      </button>

      {open ? (
        <div className="cb">
          <div ref={colsRef} className="cb-cols">
            {(narrow ? [cols[cols.length - 1]] : cols).map(column)}
          </div>
          <div className="cb-search">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a deck" aria-label="Find a deck" />
          </div>
          {results.length > 0 && (
            <ul className="cb-results">
              {results.map(({ d, path }) => (
                <li key={d.id}>
                  <button type="button" className="cb-result" onClick={() => { tapDeck(d); setQ(""); }}>
                    <span className="cb-row-icon">{hasKids(d.id) ? <FolderIcon /> : <DocIcon />}</span>
                    <span className="cb-result-path">
                      {path.slice(0, -1).map((p, i) => <span key={i} className="cb-result-up">{p} › </span>)}
                      <strong>{d.name}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div key={`deck:${folderPath}|${mergedId ?? ""}`} className="dp2-deck">
          <svg className="dp2-elbow" width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M3 0v13a6 6 0 0 0 6 6h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          {batch ? (
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
      )}
    </div>
  );
}
