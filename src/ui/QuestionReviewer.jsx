import RichText from "./RichText";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { questionsInDeck } from "../lib/decks";
import { GEN_ID_BASE } from "../data";
import { fetchReviewState, setReviewStatus, addReviewComment, removeReviewComment, fetchFlags, fetchSuggestions, decideSuggestion } from "../lib/remote";
import { useAuth } from "../lib/auth";
import { ago } from "../lib/pastSessions";
import EditQuestionModal from "./EditQuestionModal";
import QuestionExhibit from "./QuestionExhibit";
import QuestionImage from "./QuestionImage";

/**
 * Review questions (2026-10-23): the admin team — Rafil, Jacob, Rayan —
 * going through a deck one question at a time before it is published.
 *
 * Opened from a deck's ⋯ (admins only), in the Past sessions window's
 * style: the deck's questions down the left, the selected one on the right
 * as a student sees it with the answer marked and every explanation shown.
 * Approve, flag, edit or delete it; talk about it underneath. Every status
 * and comment carries who and when (migration 0046). Students' reports on
 * the question are shown with it. A Resurface deck can only be published
 * once all of its questions are approved.
 *
 * Keys: ↑/↓ or J/K move, A approves, F flags, E edits. Nothing fires while
 * typing a comment.
 *
 * Suggested: students' folders put inside this deck and sent for everyone
 * (migration 0048). Each question is added — it moves into the deck, with
 * their name on it, approved — or kept out with a reason they see. Only
 * there while some are waiting.
 */
const LETTERS = "ABCDE";
const dbId = q => q.id - GEN_ID_BASE;
const FILTERS = [
  ["all", "All"],
  ["todo", "To review"],
  ["flagged", "Flagged"],
  ["reported", "Reported"],
  ["suggested", "Suggested"],
];

function Mark({ status, reported }) {
  if (status === "approved") return <span className="qr-mark is-ok" aria-label="Approved">✓</span>;
  if (status === "flagged") return <span className="qr-mark is-flag" aria-label="Flagged">!</span>;
  if (reported) return <span className="qr-mark is-report" aria-label="Reported by students">•</span>;
  return <span className="qr-mark" aria-label="Not reviewed">–</span>;
}

/* The searched words marked in a line. */
function Hl({ text, words }) {
  const t = String(text ?? "");
  if (!words?.length) return t;
  const esc = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = t.split(new RegExp(`(${esc.join("|")})`, "ig"));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="qr-hl">{p}</mark> : p));
}

/* For a card whose stem doesn't hold the words, the line that does. */
function hitLine(x, words) {
  if (!words.length || words.some(w => String(x.q).toLowerCase().includes(w))) return null;
  const lines = [...(x.opts ?? []).map(o => `Option: ${o}`), x.exp ? `Explanation: ${x.exp}` : null, ...(x.optExp ?? []).filter(Boolean).map(o => `Note: ${o}`)].filter(Boolean);
  return lines.find(l => words.some(w => l.toLowerCase().includes(w))) ?? null;
}

/* One row of the list. Memoised, so typing in the search re-renders only
   the rows whose result changed, not a thousand of them per key. */
const Row = memo(function Row({ x, n, on, words, where, status, reported, onPick }) {
  const hit = hitLine(x, words);
  return (
    <li>
      <button type="button" className={`qr-item${on ? " is-on" : ""}`} onClick={() => onPick(x.id)}>
        <span className="qr-item__n">{n}</span>
        <span className="qr-item__text">
          <span className="qr-item__stem"><Hl text={x.q} words={words} /></span>
          {hit && <span className="qr-item__hit"><Hl text={hit} words={words} /></span>}
          <span className="qr-item__where">{where}</span>
        </span>
        {status === "sug" ? <span className="qr-mark" aria-hidden="true" /> : <Mark status={status} reported={reported} />}
      </button>
    </li>
  );
});

export default function QuestionReviewer({ deckId, deckName, actions, editPersist = null, deckIds = null, onClose }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  /* Once per deck and per edit, not per render: questionsInDeck walks every
     question in the app, and this re-rendered on every key typed. */
  const all = useMemo(() => questionsInDeck(deckId).filter(q => q.id >= GEN_ID_BASE), [deckId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const numberOf = useMemo(() => new Map(all.map((x, i) => [x.id, i + 1])), [all]);
  const [reviews, setReviews] = useState(() => new Map());     // dbId -> {status, name, at, by}
  const [comments, setComments] = useState([]);                // [{id, qid, name, body, at, by}]
  const [reports, setReports] = useState(() => new Map());     // app id -> flag row
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  /* Search (2026-10-26): find a card by any of its words, to fix it. */
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  /* The list follows the box a beat behind, so typing never waits on it. */
  const deferredQuery = useDeferredValue(query);
  const [cur, setCur] = useState(all[0]?.id ?? null);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);              // phones
  const [suggested, setSuggested] = useState([]);               // waiting questions, each with .sug
  const [keepOut, setKeepOut] = useState(null);                 // the reason being written, or null
  const listRef = useRef(null);
  const detailRef = useRef(null);

  const idsKey = all.map(q => q.id).join(",");
  async function load() {
    try {
      const ids = idsKey ? idsKey.split(",").map(Number).map(id => id - GEN_ID_BASE) : [];
      const [state, flags, sugs] = await Promise.all([
        fetchReviewState(ids), fetchFlags().catch(() => []), fetchSuggestions().catch(() => []),
      ]);
      setSuggested(sugs
        .filter(s => s.target === deckId || deckIds?.has(s.target))
        .flatMap(s => s.questions.filter(x => !x.status).map(x => ({ ...x, sug: s }))));
      setReviews(new Map((state.reviews ?? []).map(r => [r.qid, r])));
      setComments(state.comments ?? []);
      setReports(new Map((flags ?? []).map(f => [f.question_id, f])));
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Couldn’t load the review. Check your connection.");
    }
  }
  useEffect(() => { load(); }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusOf = q => reviews.get(dbId(q))?.status ?? null;
  const shown = all.filter(q => {
    if (filter === "todo") return statusOf(q) !== "approved";
    if (filter === "flagged") return statusOf(q) === "flagged";
    if (filter === "reported") return reports.has(q.id);
    return true;
  });
  if (filter === "suggested") shown.splice(0, shown.length, ...suggested);
  /* Every word typed must appear somewhere in the card: the stem, an
     option, the explanation, a wrong option's note, or where it lives. */
  const words = useMemo(() => deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean), [deferredQuery]);
  const textIndex = useMemo(() => new Map(all.map(x => [x.id,
    [x.q, ...(x.opts ?? []), x.exp, ...(x.optExp ?? []), ...(x.path ?? []).map(p => p.name), x.topic?.title, x.topic?.body]
      .filter(t => typeof t === "string").join(" \n ").toLowerCase()])), [all]);
  if (words.length) shown.splice(0, shown.length, ...shown.filter(x => { const t = textIndex.get(x.id) ?? ""; return words.every(w => t.includes(w)); }));

  const q = (filter === "suggested" ? suggested : all).find(x => x.id === cur) ?? shown[0] ?? null;
  /* Setters only, so the same function every render and the rows stay memoised. */
  const pick = useCallback(id => { setCur(id); setShowList(false); setConfirmDelete(false); }, []);
  const idx = q ? shown.findIndex(x => x.id === q.id) : -1;
  const approved = all.filter(x => statusOf(x) === "approved").length;
  const flagged = all.filter(x => statusOf(x) === "flagged").length;
  const reportedN = all.filter(x => reports.has(x.id)).length;
  const counts = { all: all.length, todo: all.length - approved, flagged, reported: reportedN, suggested: suggested.length };

  const go = step => {
    if (!shown.length) return;
    const i = idx < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, idx + step));
    setCur(shown[i].id);
    setConfirmDelete(false);
  };

  /* Keep the selected row in view, and the detail at its top. */
  useEffect(() => {
    listRef.current?.querySelector(".qr-item.is-on")?.scrollIntoView({ block: "nearest" });
    detailRef.current?.scrollTo?.({ top: 0 });
    setDraft("");
  }, [q?.id]);

  async function setStatus(status) {
    if (!q) return;
    const id = dbId(q);
    const prev = reviews.get(id);
    const next = prev?.status === status ? null : status;
    setReviews(m => {
      const n = new Map(m);
      if (next) n.set(id, { qid: id, status: next, name: "You", by: user?.id, at: new Date().toISOString() });
      else n.delete(id);
      return n;
    });
    try { await setReviewStatus(id, next); }
    catch { setReviews(m => { const n = new Map(m); prev ? n.set(id, prev) : n.delete(id); return n; }); return; }
    /* Approving moves on to the next one still to do. */
    if (next === "approved") {
      const after = shown.slice(idx + 1).find(x => statusOf(x) !== "approved" && x.id !== q.id);
      if (after) setCur(after.id);
    }
  }

  /* A suggested question: added for everyone, or kept out (with a reason
     the student sees). Either way it leaves this list. */
  async function decide(x, accept, why = null) {
    setBusy(true);
    try { await decideSuggestion(x.dbId, accept, why); }
    catch (e) { setLoadError(e.message || "That didn’t go through."); setBusy(false); return; }
    setBusy(false);
    setKeepOut(null);
    const rest = suggested.filter(s => s.id !== x.id);
    setSuggested(rest);
    setCur(rest[Math.min(Math.max(idx, 0), rest.length - 1)]?.id ?? null);
    if (accept) actions?.refresh?.();
  }
  async function addAll(s) {
    setBusy(true);
    try { for (const x of suggested.filter(y => y.sug.id === s.id)) await decideSuggestion(x.dbId, true); }
    catch (e) { setLoadError(e.message || "That didn’t go through."); }
    setBusy(false);
    await load();
    actions?.refresh?.();
  }

  async function post() {
    const body = draft.trim();
    if (!body || !q || busy) return;
    setBusy(true);
    try {
      await addReviewComment(dbId(q), body);
      setDraft("");
      await load();
    } finally { setBusy(false); }
  }
  async function unpost(c) {
    setComments(cs => cs.filter(x => x.id !== c.id));
    try { await removeReviewComment(c.id); } catch { load(); }
  }

  function remove() {
    if (!q) return;
    const gone = q.id;
    const i = idx;
    actions?.deleteQuestions?.([gone]);
    setConfirmDelete(false);
    const rest = shown.filter(x => x.id !== gone);
    setCur(rest[Math.min(i, rest.length - 1)]?.id ?? null);
    setTimeout(() => setVersion(v => v + 1), 300);
  }

  useEffect(() => {
    const onKey = e => {
      if (editing) return;
      if (e.key === "Escape") { if (confirmDelete) setConfirmDelete(false); else onClose(); return; }
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "j") { e.preventDefault(); go(1); }
      else if (k === "arrowup" || k === "k") { e.preventDefault(); go(-1); }
      else if (q?.sug) { if (k === "a" && !busy) decide(q, true); }
      else if (k === "a") setStatus("approved");
      else if (k === "f") setStatus("flagged");
      else if (k === "e" && q) setEditing(q);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const where = x => {
    if (x.sug) return `From ${x.sug.by} · ${x.sug.deckName}`;
    const path = x.path ?? [];
    const at = path.findIndex(p => p.id === deckId);
    return path.slice(at + 1).map(p => p.name).join(" › ");
  };
  const review = q ? reviews.get(dbId(q)) : null;
  const thread = q ? comments.filter(c => c.qid === dbId(q)) : [];
  const report = q ? reports.get(q.id) : null;
  const pct = all.length ? Math.round((approved / all.length) * 100) : 0;

  return createPortal(
    <div className="np-scrim pss-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pss qr" role="dialog" aria-modal="true" aria-labelledby="qr-title">
        <button type="button" className="pss-x" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        </button>

        <header className="qr-head">
          <h2 className="pss-title" id="qr-title">Review · {deckName}</h2>
          <p className="pss-sub qr-progress-line">
            <span><strong>{approved}</strong> of {all.length} approved</span>
            {flagged > 0 && <span> · {flagged} flagged</span>}
            {reportedN > 0 && <span> · {reportedN} reported by students</span>}
          </p>
          <div className="qr-progress" role="img" aria-label={`${pct}% approved`}><span style={{ width: `${pct}%` }} /></div>
          <div className="qr-toolbar">
            <div className="pss-seg" role="tablist" aria-label="Show">
              {FILTERS.filter(([k]) => k !== "suggested" || suggested.length > 0 || filter === k).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={`pss-seg__b${filter === k ? " is-on" : ""}`}
                  onClick={() => { setFilter(k); setShowList(true); }}>
                  {label}<span className="pss-seg__n">{counts[k]}</span>
                </button>
              ))}
            </div>
            <label className="qr-search">
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              <input ref={searchRef} type="search" value={query} placeholder="Search questions" aria-label="Search questions"
                onChange={e => { setQuery(e.target.value); setShowList(true); }}
                onKeyDown={e => {
                  if (e.key === "Escape" && query) { e.preventDefault(); e.stopPropagation(); setQuery(""); }
                  if (e.key === "Enter" && shown[0]) { setCur(shown[0].id); setShowList(false); e.currentTarget.blur(); }
                }} />
              {words.length > 0 && <span className="qr-search__n">{shown.length} {shown.length === 1 ? "match" : "matches"}</span>}
            </label>
            <span className="qr-keys" aria-hidden="true">{filter === "suggested" ? "↑↓ move · A add for everyone" : "/ search · ↑↓ move · A approve · F flag · E edit"}</span>
          </div>
          {loadError && <p className="qr-error">{loadError} <button type="button" className="gen-link" onClick={load}>Try again</button></p>}
        </header>

        <div className={`qr-body${showList ? " is-list" : ""}`}>
          <ol className="qr-list" ref={listRef} aria-label="Questions">
            {shown.map((x, i) => (
              <Row key={x.id} x={x} n={x.sug ? i + 1 : numberOf.get(x.id)} on={!!q && x.id === q.id} words={words}
                where={where(x) || deckName} status={x.sug ? "sug" : statusOf(x)} reported={reports.has(x.id)}
                onPick={pick} />
            ))}
            {shown.length === 0 && <li className="pss-none">{words.length ? "No question matches that search." : filter === "todo" ? "Everything here is approved." : filter === "suggested" ? "No suggestions waiting." : "Nothing here."}</li>}
          </ol>

          <section className="qr-detail" ref={detailRef} aria-live="polite">
            {!q ? <p className="pss-none">No questions to review in this deck.</p> : (
              <>
                <div className="qr-nav">
                  <button type="button" className="gen-link qr-listbtn" onClick={() => setShowList(true)}>All questions</button>
                  <span className="qr-pos">{idx + 1} of {shown.length}</span>
                  <span className="qr-navbtns">
                    <button type="button" className="pss-btn btn-press" onClick={() => go(-1)} disabled={idx <= 0} aria-label="Previous question">↑</button>
                    <button type="button" className="pss-btn btn-press" onClick={() => go(1)} disabled={idx >= shown.length - 1} aria-label="Next question">↓</button>
                  </span>
                </div>
                <p className="qr-where">{where(q) || deckName}</p>
                <h3 className="qr-stem">{q.q}</h3>
                {q.img && <QuestionImage path={q.img} />}
                {q.exhibit && <QuestionExhibit exhibit={q.exhibit} answered />}
                {q.ask && <p className="qr-stem qr-ask">{q.ask}</p>}

                <ol className="qr-opts">
                  {q.opts.map((o, i) => (
                    <li key={i} className={`qr-opt${i === q.ans ? " is-ans" : ""}`}>
                      <span className="qr-opt__l">{LETTERS[i]}</span>
                      <span className="qr-opt__body">
                        <span className="qr-opt__text">{o}{i === q.ans && <span className="qr-opt__tick" aria-label="Correct answer"> ✓</span>}</span>
                        {q.optExp?.[i] && <span className="qr-opt__why">{q.optExp[i]}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
                {q.exp && <div className="qr-exp"><span className="qr-label">Explanation</span><p>{q.exp}</p></div>}
                {/* The knowledge library note, so it is checked with the rest. */}
                {q.topic?.title && (
                  <div className="qr-exp"><span className="qr-label">Topic note: {q.topic.title}</span><RichText text={q.topic.body || ""} /></div>
                )}

                {report && (
                  <div className="qr-report">
                    <span className="qr-label">Reported by {report.flags} {Number(report.flags) === 1 ? "student" : "students"}</span>
                    <ul>
                      {(report.reporters ?? []).map((r, i) => (
                        <li key={i}>{r.name || "A student"}{r.note ? `: “${r.note}”` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {q.sug ? (
                  <>
                    <div className="qr-report qr-sug">
                      <span className="qr-label">Suggested by {q.sug.by} · {ago(q.sug.at)}</span>
                      {q.sug.note && <p>“{q.sug.note}”</p>}
                    </div>
                    {keepOut !== null ? (
                      <div className="qr-keepout">
                        <textarea className="np__field qr-input" rows={2} maxLength={1000} autoFocus
                          placeholder={`Why it isn’t going in (${q.sug.by} sees this)`}
                          value={keepOut} onChange={e => setKeepOut(e.target.value)} />
                        <div className="qr-actions">
                          <button type="button" className="pss-btn btn-press" disabled={busy} onClick={() => decide(q, false, keepOut)}>Keep out</button>
                          <button type="button" className="gen-link" onClick={() => setKeepOut(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="qr-actions">
                        <button type="button" className="pss-btn btn-press is-primary" disabled={busy} onClick={() => decide(q, true)}>Add for everyone</button>
                        <button type="button" className="pss-btn btn-press" disabled={busy} onClick={() => setKeepOut("")}>Keep out</button>
                        {suggested.filter(y => y.sug.id === q.sug.id).length > 1 && (
                          <button type="button" className="gen-link qr-addall" disabled={busy} onClick={() => addAll(q.sug)}>
                            Add all {suggested.filter(y => y.sug.id === q.sug.id).length}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="qr-actions">
                    <button type="button" className={`pss-btn btn-press${review?.status === "approved" ? " is-primary" : ""}`} onClick={() => setStatus("approved")}>
                      {review?.status === "approved" ? "Approved ✓" : "Approve"}
                    </button>
                    <button type="button" className={`pss-btn btn-press${review?.status === "flagged" ? " is-flagged" : ""}`} onClick={() => setStatus("flagged")}>
                      {review?.status === "flagged" ? "Flagged" : "Flag"}
                    </button>
                    <button type="button" className="pss-btn btn-press" onClick={() => setEditing(q)}>Edit</button>
                    {confirmDelete
                      ? <span className="qr-confirm">Delete for everyone? <button type="button" className="pss-btn btn-press is-danger" onClick={remove}>Delete</button> <button type="button" className="gen-link" onClick={() => setConfirmDelete(false)}>Cancel</button></span>
                      : <button type="button" className="gen-link qr-delete" onClick={() => setConfirmDelete(true)}>Delete</button>}
                  </div>
                )}
                {review && !q.sug && <p className="qr-who">{review.status === "approved" ? "Approved" : "Flagged"} by {review.name} · {ago(review.at)}</p>}

                <div className="qr-thread">
                  <span className="qr-label">Comments{thread.length ? ` · ${thread.length}` : ""}</span>
                  {thread.map(c => (
                    <div key={c.id} className="qr-comment">
                      <div className="qr-comment__head">
                        <strong>{c.name}</strong> <span>{ago(c.at)}</span>
                        {c.by === user?.id && <button type="button" className="gen-link qr-comment__del" onClick={() => unpost(c)}>Delete</button>}
                      </div>
                      <p>{c.body}</p>
                    </div>
                  ))}
                  <div className="qr-compose">
                    <textarea className="np__field qr-input" rows={2} maxLength={2000} placeholder="Add a comment for the team"
                      value={draft} onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } }} />
                    <button type="button" className="pss-btn btn-press is-primary" onClick={post} disabled={!draft.trim() || busy}>Comment</button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
      {editing && (
        <EditQuestionModal q={editing} persist={editPersist ? updated => editPersist(updated, editing) : null}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); setVersion(v => v + 1); }} />
      )}
    </div>,
    document.body,
  );
}
