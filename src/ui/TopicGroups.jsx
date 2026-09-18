import { useEffect, useMemo, useRef, useState } from "react";
import { QUESTIONS } from "../data";
import { groupShareUrl } from "../lib/groups";
import TopicPicker from "./TopicPicker";

/**
 * The tabs across the top of Study, and the two controls a tab has.
 *
 * "All" is the curriculum as it comes. Every other tab is a group of
 * topics you put together, shown as its own tree, and it has exactly what
 * a deck has: Add, and a menu. Add offers a lecture (Generate) or the
 * bank (a picker where ticking adds and unticking removes). The menu is
 * Rename, Share, Delete. Groups people send you appear as tabs too,
 * read-only, with Share only.
 */

// ── Tabs ─────────────────────────────────────────────────────────────────

export function GroupTabs({ groups, activeId, onSelect, onNew }) {
  return (
    <div className="tg-tabs" role="tablist" aria-label="Topic groups">
      <button type="button" role="tab" aria-selected={activeId === null}
        className={`tg-tab${activeId === null ? " is-active" : ""}`} onClick={() => onSelect(null)}>
        All
      </button>
      {groups.map(g => (
        <button key={g.id} type="button" role="tab" aria-selected={g.id === activeId}
          className={`tg-tab${g.id === activeId ? " is-active" : ""}${g.mine ? "" : " is-shared"}`}
          onClick={() => onSelect(g.id)}>
          {g.name}
        </button>
      ))}
      <button type="button" className="tg-tab tg-tab-new" onClick={onNew} aria-label="New group">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        New
      </button>
    </div>
  );
}

// ── A small menu anchored to a text control ──────────────────────────────

function Menu({ label, items, align = "right", strong = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span className="tg-menu" ref={ref}>
      <button type="button" className={`tg-menu-btn${strong ? " is-strong" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {label}
      </button>
      {open && (
        <span className={`tg-menu-pop anim-scale-in is-${align}`} role="menu">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" className={`tg-menu-item${it.danger ? " is-danger" : ""}`}
              onClick={() => { setOpen(false); it.onSelect(); }}>
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * The two controls beside a tab's heading: Add, and the menu. Rename is
 * done inline through onRename (the caller shows the field).
 */
export function GroupControls({ group, actions, onGenerate, onChoose, onRename }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try { await navigator.clipboard.writeText(groupShareUrl(group)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link", groupShareUrl(group)); }
  }
  const addItems = [
    ...(onGenerate ? [{ label: "Generate from a lecture", onSelect: () => onGenerate(group) }] : []),
    { label: "Choose from the bank", onSelect: onChoose },
  ];
  const menuItems = group.mine
    ? [
        { label: "Rename", onSelect: onRename },
        { label: copied ? "Link copied" : "Share", onSelect: share },
        { label: "Delete", danger: true, onSelect: () => { if (window.confirm(`Delete “${group.name}”?`)) actions.deleteGroup(group.id); } },
      ]
    : [
        { label: copied ? "Link copied" : "Share", onSelect: share },
        { label: "Remove", danger: true, onSelect: () => { if (window.confirm(`Remove “${group.name}”?`)) actions.deleteGroup(group.id); } },
      ];
  return (
    <span className="tg-controls">
      {group.mine && <Menu label={<><span aria-hidden="true">＋</span> Add</>} items={addItems} strong />}
      <Menu label="⋯" items={menuItems} />
    </span>
  );
}

/**
 * Choosing from the bank: the curriculum picker with the group's topics
 * ticked. Ticking adds, unticking removes. Done closes it.
 */
export function GroupChooser({ group, actions, eligibleIds, pStats, query, onDone }) {
  const [mineOnly, setMineOnly] = useState(false);
  const pickerIds = useMemo(() => {
    if (!mineOnly) return eligibleIds;
    const mine = new Set(QUESTIONS.filter(q => q.gen).map(q => q.id));
    return eligibleIds.filter(id => mine.has(id));
  }, [mineOnly, eligibleIds]);

  const pickerValue = { deck: ["All"], cat: group.topics.length ? group.topics.map(t => t.cat) : ["All"] };
  function onPick(next) {
    const cats = next.cat?.includes("All") ? [] : (next.cat ?? []);
    const topics = cats.map(cat => {
      const known = group.topics.find(t => t.cat === cat);
      if (known) return known;
      const q = QUESTIONS.find(x => x.cat === cat);
      return { deck: q?.deck ?? "", cat };
    });
    actions.setGroupTopics(group.id, topics);
  }
  return (
    <div className="tg-adding">
      <div className="tg-source" role="radiogroup" aria-label="Pick from">
        <button type="button" role="radio" aria-checked={!mineOnly} className={`tg-source-opt${!mineOnly ? " is-on" : ""}`} onClick={() => setMineOnly(false)}>Everything</button>
        <button type="button" role="radio" aria-checked={mineOnly} className={`tg-source-opt${mineOnly ? " is-on" : ""}`} onClick={() => setMineOnly(true)}>My decks</button>
        <button type="button" className="gen-link tg-source-done" onClick={onDone}>Done</button>
      </div>
      <TopicPicker value={pickerValue} onChange={onPick} pStats={pStats} eligibleIds={pickerIds} query={query} />
    </div>
  );
}

/** The inline "name a new group" field. */
export function NewGroupForm({ onCreate, onCancel, initial = "", placeholder = "Name it — “Week 3”, “Cardio”, “Keeps going wrong”" }) {
  const [name, setName] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  function submit(e) {
    e.preventDefault();
    const n = name.trim();
    if (n) onCreate(n);
  }
  return (
    <form className="tg-new" onSubmit={submit}>
      <input ref={ref} value={name} onChange={e => setName(e.target.value)} placeholder={placeholder} maxLength={60} aria-label="Group name" />
      <button type="submit" className="gen-link" disabled={!name.trim()}>{initial ? "Save" : "Create"}</button>
      <button type="button" className="gen-link tg-cancel" onClick={onCancel}>Cancel</button>
    </form>
  );
}
