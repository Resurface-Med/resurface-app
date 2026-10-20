import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ago, dayLabel, wrongIds, waitingMistakes } from "../lib/pastSessions";

/**
 * Past sessions (2026-10-20), after PassMedicine's previous-sessions page,
 * which a student asked for — in a big window, in the app's own look.
 *
 * Two views in one window:
 *   the history — a table: the session, its result (a sentence and a bar of
 *     right against wrong), when, and what to do with it;
 *   one session — its result and filters on the left, every question on the
 *     right, numbered, marked right or wrong, each with its own Review.
 *
 * Plain on purpose (an earlier version with rings, strips and a mistakes
 * count read as "AI-looking"): hairlines, text, and the app's two button
 * styles. The mistakes still waiting are a quiet line under the title.
 */

const Chev = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Bar({ s }) {
  const right = s.correct, wrong = s.finished ? s.total - s.correct : s.answered - s.correct;
  const rest = Math.max(0, s.total - right - wrong);
  return (
    <span className="pss-bar" aria-hidden="true">
      {right > 0 && <span className="is-right" style={{ flex: right }} />}
      {wrong > 0 && <span className="is-wrong" style={{ flex: wrong }} />}
      {rest > 0 && <span style={{ flex: rest }} />}
    </span>
  );
}

const result = s => {
  if (!s.answered && !s.finished) return "Not started";
  const pct = s.answered ? Math.round((s.correct / (s.finished ? s.total : s.answered)) * 100) : 0;
  return s.finished ? `${s.correct} of ${s.total} right · ${pct}%` : `${s.answered} of ${s.total} answered`;
};

function History({ sessions, liveIds, waiting, onOpen, onFix, onDetail }) {
  /* A slightly heavier rule where a new day starts. */
  const dayStart = sessions.map((s, i) => i === 0 || dayLabel(s.updated_at) !== dayLabel(sessions[i - 1].updated_at));
  return (
    <>
      <div className="pss-intro">
        <h2 className="pss-title" id="pss-title">Past sessions</h2>
        <p className="pss-sub">
          Continue, review or redo a session.
          {waiting.length > 0 && (
            <> {waiting.length} {waiting.length === 1 ? "question" : "questions"} you got wrong {waiting.length === 1 ? "hasn’t" : "haven’t"} been answered again — <button type="button" className="gen-link" onClick={() => onFix(waiting)}>go through {waiting.length === 1 ? "it" : "them"}</button>.</>
          )}
        </p>
      </div>
      <div className="pss-table" role="table" aria-label="Past sessions">
        <div className="pss-tr pss-th" role="row">
          <span role="columnheader">Session</span>
          <span role="columnheader">Result</span>
          <span role="columnheader">When</span>
          <span role="columnheader" className="pss-actions-h">Actions</span>
        </div>
        {sessions.map((s, i) => {
          const w = wrongIds(s).filter(id => !liveIds || liveIds.has(id)).length;
          return (
            <div key={s.id} className={`pss-tr${dayStart[i] && i > 0 ? " is-day-start" : ""}`} role="row">
              <span className="pss-session" role="cell">
                <span className="pss-name">{s.label || "Practice"}</span>
                <span className="pss-count">{s.total} question{s.total === 1 ? "" : "s"}</span>
              </span>
              <span className="pss-result" role="cell">
                <span>{result(s)}</span>
                <Bar s={s} />
              </span>
              <span className="pss-when" role="cell">{ago(s.updated_at)}</span>
              <span className="pss-acts" role="cell">
                {!s.finished && (
                  <button type="button" className="pss-btn is-primary btn-press" onClick={() => onOpen(s, "continue")}>Continue <Chev /></button>
                )}
                {s.answered > 0 && (
                  <button type="button" className={`pss-btn btn-press${s.finished ? " is-primary" : ""}`} onClick={() => onDetail(s)}>Review <Chev /></button>
                )}
                {s.finished && w > 0 && (
                  <button type="button" className="pss-btn btn-press" onClick={() => onOpen(s, "wrong")}>Redo wrong <Chev /></button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const FILTERS = [["all", "All"], ["wrong", "Wrong"], ["right", "Right"]];

function Detail({ s, questions, onBack, onOpen }) {
  const [filter, setFilter] = useState("all");
  const byId = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions]);
  const rows = (s.items ?? []).map((it, i) => {
    const q = byId.get(it.id);
    const state = it.pick == null ? (s.finished ? "wrong" : "open") : it.ok ? "right" : "wrong";
    return { i, q, state };
  });
  const shown = rows.filter(r => filter === "all" || r.state === filter);
  /* The deck under each question only when they come from more than one. */
  const mixed = new Set(rows.map(r => r.q?.cat).filter(Boolean)).size > 1;
  const wrong = rows.filter(r => r.state === "wrong").length;
  const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
  return (
    <div className="pss-detail">
      <aside className="pss-side">
        <button type="button" className="gen-link pss-back" onClick={onBack}>← All sessions</button>
        <h2 className="pss-title" id="pss-title">{s.label || "Practice"}</h2>
        <p className="pss-sub">{dayLabel(s.updated_at)} · {ago(s.updated_at)}</p>
        <p className="pss-score">
          {s.finished
            ? <>You answered all {s.total}, and got <strong>{s.correct}</strong> right ({pct}%).</>
            : <>You’ve answered {s.answered} of {s.total}, and got <strong>{s.correct}</strong> right.</>}
        </p>
        <div className="pss-seg" role="radiogroup" aria-label="Show">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k}
              className={`pss-seg__b${filter === k ? " is-on" : ""}`} onClick={() => setFilter(k)}>
              {l} <span className="pss-seg__n">{k === "all" ? rows.length : rows.filter(r => r.state === k).length}</span>
            </button>
          ))}
        </div>
        <div className="pss-side-acts">
          {!s.finished && <button type="button" className="pss-btn is-primary btn-press" onClick={() => onOpen(s, "continue")}>Continue <Chev /></button>}
          {wrong > 0 && <button type="button" className={`pss-btn btn-press${s.finished ? " is-primary" : ""}`} onClick={() => onOpen(s, "wrong")}>Redo the {wrong} wrong <Chev /></button>}
          <button type="button" className="pss-btn btn-press" onClick={() => onOpen(s, "redo")}>Redo all {s.total} <Chev /></button>
        </div>
      </aside>
      <ol className="pss-qs">
        {shown.map(({ i, q, state }) => (
          <li key={i} className="pss-q">
            <span className="pss-q__n">{i + 1}</span>
            <span className="pss-q__text">
              <span className="pss-q__stem">{q ? q.q : "This question has since been deleted."}</span>
              {mixed && q?.cat && <span className="pss-q__topic">{q.cat}</span>}
            </span>
            <span className={`pss-mark is-${state}`} aria-label={state === "right" ? "Right" : state === "wrong" ? "Wrong" : "Not answered"}>
              {state === "right" ? "✓" : state === "wrong" ? "✕" : "–"}
            </span>
            {q && <button type="button" className="pss-btn btn-press" onClick={() => onOpen(s, "continue", i)}>Review <Chev /></button>}
          </li>
        ))}
        {shown.length === 0 && <li className="pss-none">None {filter === "wrong" ? "wrong" : "right"} in this session.</li>}
      </ol>
    </div>
  );
}

export default function PastSessions({ sessions, srCards = {}, liveIds = null, questions = [], onOpen, onFix, onClose }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") { if (detail) setDetail(null); else onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, detail]);
  const waiting = useMemo(() => waitingMistakes(sessions, srCards, liveIds), [sessions, srCards, liveIds]);
  const open = detail ? sessions.find(s => s.id === detail) : null;

  return createPortal(
    <div className="np-scrim pss-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pss" role="dialog" aria-modal="true" aria-labelledby="pss-title">
        <button type="button" className="pss-x" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        </button>
        <div className="pss-body" key={open ? open.id : "list"}>
          {open
            ? <Detail s={open} questions={questions} onBack={() => setDetail(null)} onOpen={onOpen} />
            : <History sessions={sessions} liveIds={liveIds} waiting={waiting} onOpen={onOpen} onFix={onFix} onDetail={s => setDetail(s.id)} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
