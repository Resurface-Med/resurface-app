import { useEffect, useMemo, useRef, useState } from "react";
import { QUESTIONS } from "../data";
import { topicKey, groupShareUrl } from "../lib/groups";
import TopicPicker from "./TopicPicker";

/**
 * The tabs across the top of Study.
 *
 * "All" is the curriculum as it comes. Every other tab is a group of
 * topics you put together — Week 3, Cardio, the things that keep going
 * wrong — and pressing Start on a tab practises exactly those. "Add
 * topics" opens the curriculum picker with the group's topics ticked;
 * ticking puts a topic in, unticking takes it out. Groups people send you
 * appear as tabs too, read-only, with their name on.
 */

function shortCat(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

function countFor(topic, eligibleIds) {
  const el = new Set(eligibleIds);
  return QUESTIONS.filter(q => q.deck === topic.deck && q.cat === topic.cat && el.has(q.id)).length;
}

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

// ── A group's topics ─────────────────────────────────────────────────────

function TopicRow({ topic, count, editable, onRemove }) {
  return (
    <li className={`tg-row${count === 0 ? " is-empty" : ""}`}>
      <span className="tg-row-body">
        <span className="tg-row-name">{shortCat(topic.cat, topic.deck)}</span>
        <span className="tg-row-deck">{topic.deck}</span>
      </span>
      <span className="tg-row-count">{count}</span>
      {editable && (
        <button type="button" className="tg-row-x" aria-label="Remove from group" onClick={() => onRemove(topic)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </li>
  );
}

/**
 * The body under the tabs when a group is selected. Owns the picker's
 * "adding" mode: ticking a topic there puts it in the group.
 */
export function GroupBody({ group, actions, eligibleIds, pStats, query, adding, setAdding, onGenerate = null }) {
  const [renaming, setRenaming] = useState(false);
  /* In the picker, "Mine" narrows the tree to the questions you made —
     your own decks, without the whole curriculum around them. */
  const [mineOnly, setMineOnly] = useState(false);
  const pickerIds = useMemo(() => {
    if (!mineOnly) return eligibleIds;
    const mine = new Set(QUESTIONS.filter(q => q.gen).map(q => q.id));
    return eligibleIds.filter(id => mine.has(id));
  }, [mineOnly, eligibleIds]);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setRenaming(false); setCopied(false); }, [group.id]);

  const counts = useMemo(() => group.topics.map(t => countFor(t, eligibleIds)), [group.topics, eligibleIds]);
  const total = counts.reduce((a, b) => a + b, 0);

  function commitRename() {
    const n = draft.trim();
    if (n && n !== group.name) actions.renameGroup(group.id, n);
    setRenaming(false);
  }
  async function share() {
    try { await navigator.clipboard.writeText(groupShareUrl(group)); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link", groupShareUrl(group)); }
  }
  function remove(topic) {
    actions.setGroupTopics(group.id, group.topics.filter(t => topicKey(t) !== topicKey(topic)));
  }

  /* The picker in adding mode: its value is the group's topics; a change
     is the new list. */
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
    <div className="tg-body">
      <div className="tg-head">
        {renaming ? (
          <input
            autoFocus
            className="tg-name-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
            maxLength={60}
            aria-label="Group name"
          />
        ) : (
          <h2 className="tg-name" onClick={() => { if (group.mine) { setDraft(group.name); setRenaming(true); } }} title={group.mine ? "Rename" : undefined}>
            {group.name}
          </h2>
        )}
        <p className="tg-meta">
          {group.topics.length} topic{group.topics.length === 1 ? "" : "s"} · {total} question{total === 1 ? "" : "s"}
          {!group.mine && group.ownerName ? <> · from {group.ownerName}</> : null}
        </p>
        <div className="tg-actions">
          {group.mine && onGenerate && !adding && (
            <button type="button" className="gen-link" onClick={() => onGenerate(group)}>Generate questions</button>
          )}
          {group.mine && (
            <button type="button" className={`gen-link${adding ? " is-on" : ""}`} onClick={() => setAdding(a => !a)}>
              {adding ? "Done" : "Add from the bank"}
            </button>
          )}
          <button type="button" className="gen-link" onClick={share}>{copied ? "Link copied" : "Share"}</button>
          <button type="button" className="gen-link tg-delete" onClick={() => {
            if (window.confirm(group.mine ? `Delete “${group.name}”?` : `Remove “${group.name}”?`)) actions.deleteGroup(group.id);
          }}>
            {group.mine ? "Delete" : "Remove"}
          </button>
        </div>
      </div>

      {adding ? (
        <div className="tg-adding">
          <div className="tg-source" role="radiogroup" aria-label="Pick from">
            <button type="button" role="radio" aria-checked={!mineOnly} className={`tg-source-opt${!mineOnly ? " is-on" : ""}`} onClick={() => setMineOnly(false)}>Everything</button>
            <button type="button" role="radio" aria-checked={mineOnly} className={`tg-source-opt${mineOnly ? " is-on" : ""}`} onClick={() => setMineOnly(true)}>My decks</button>
          </div>
          <TopicPicker value={pickerValue} onChange={onPick} pStats={pStats} eligibleIds={pickerIds} query={query} />
        </div>
      ) : (
        <ol className={`tg-rows${group.topics.length === 0 ? " is-empty" : ""}`}>
          {group.topics.length === 0 && (
            <li className="tg-rows-empty">
              {group.mine ? (
                <>
                  Nothing here yet.{" "}
                  {onGenerate && <button type="button" className="gen-link" onClick={() => onGenerate(group)}>Generate questions from a lecture</button>}
                  {onGenerate ? ", or " : ""}
                  <button type="button" className="gen-link" onClick={() => setAdding(true)}>add topics from the bank</button>.
                </>
              ) : "Nothing in this group."}
            </li>
          )}
          {group.topics.map((t, i) => (
            <TopicRow key={topicKey(t)} topic={t} count={counts[i]} editable={group.mine} onRemove={remove} />
          ))}
        </ol>
      )}
    </div>
  );
}

/** The inline "name a new group" field. */
export function NewGroupForm({ onCreate, onCancel }) {
  const [name, setName] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  function submit(e) {
    e.preventDefault();
    const n = name.trim();
    if (n) onCreate(n);
  }
  return (
    <form className="tg-new" onSubmit={submit}>
      <input ref={ref} value={name} onChange={e => setName(e.target.value)} placeholder="Name it — “Week 3”, “Cardio”, “Keeps going wrong”" maxLength={60} aria-label="Group name" />
      <button type="submit" className="gen-link" disabled={!name.trim()}>Create</button>
      <button type="button" className="gen-link tg-cancel" onClick={onCancel}>Cancel</button>
    </form>
  );
}
