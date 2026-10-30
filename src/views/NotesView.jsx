import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import QuestionCard from "../ui/QuestionCard";
import { QUESTIONS } from "../data";
import { useNotes, notedQuestions, groupNotes } from "../lib/notes";

/**
 * My notes (2026-10-30): every note you've written on a question, in one
 * place.
 *
 * Organised by what already exists rather than by anything you have to
 * sort: lecture, then the topic inside it, and only the lectures and topics
 * you've written in — nothing else appears. Your words lead; the question
 * sits under them, small. Tapping one opens the question in full, answered,
 * with your note at the foot to keep editing, and arrows through the rest.
 */

const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };

const ago = iso => {
  if (!iso) return "";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

function Viewer({ list, at, onMove, onClose }) {
  const item = list[at];
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.("textarea, input")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && at < list.length - 1) onMove(at + 1);
      else if (e.key === "ArrowLeft" && at > 0) onMove(at - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [at, list.length, onMove, onClose]);
  if (!item) return null;
  const where = (item.q.path ?? []).map(p => p.name).join(" › ");
  return createPortal(
    <div className="np-scrim pss-scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pss notes-view" role="dialog" aria-modal="true" aria-label="Note">
        <button type="button" className="pss-x" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        </button>
        <div className="notes-view__bar">
          <span className="notes-view__where">{where}</span>
          {list.length > 1 && (
            <span className="notes-view__step">
              <button type="button" className="notes-view__arrow" disabled={at === 0} onClick={() => onMove(at - 1)} aria-label="Previous note">‹</button>
              <span>{at + 1} of {list.length}</span>
              <button type="button" className="notes-view__arrow" disabled={at === list.length - 1} onClick={() => onMove(at + 1)} aria-label="Next note">›</button>
            </span>
          )}
        </div>
        <div className="notes-view__body" key={item.q.id}>
          <QuestionCard q={item.q} sel={item.q.ans} timedOut={false} onAnswer={() => {}} hideActions />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function NotesView({ onStudy }) {
  const ctx = useNotes();
  const [query, setQuery] = useState("");
  /* The list as it was when a note was opened: editing one makes it the
     newest, and the arrows shouldn't reshuffle under you. */
  const [view, setView] = useState(null);           // { list, at }
  const all = useMemo(() => notedQuestions(ctx?.notes, QUESTIONS), [ctx?.notes]);
  const shown = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return all;
    return all.filter(({ q, note }) => note.body.toLowerCase().includes(t) || String(q.q).toLowerCase().includes(t)
      || (q.topic?.title ?? "").toLowerCase().includes(t) || (q.path ?? []).some(p => String(p.name).toLowerCase().includes(t)));
  }, [all, query]);
  const groups = useMemo(() => groupNotes(shown), [shown]);
  /* The viewer steps through notes in the order they're listed. */
  const order = useMemo(() => groups.flatMap(g => g.topics.flatMap(t => t.items)), [groups]);
  const lectures = new Set(all.map(x => (x.q.path ?? []).map(p => p.name).join(" › "))).size;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>My notes</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em" }}>
          {all.length
            ? `${all.length} ${all.length === 1 ? "note" : "notes"} across ${lectures} ${lectures === 1 ? "lecture" : "lectures"}. Only you can see them.`
            : "What you write under a question, kept by lecture. Only you can see them."}
        </p>
      </div>
      <Wave from="transparent" to="var(--c-card-solid)" />
      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, paddingTop: "clamp(16px, 2.6vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          {all.length === 0 ? (
            <div className="prog-blank">
              <div className="prog-blank-inner">
                <h2 className="prog-blank-title">No notes yet</h2>
                <p className="prog-blank-body">After you answer a question, tap Add a note under the explanation. Your notes collect here, by lecture.</p>
                {onStudy && <button type="button" className="prog-blank-cta btn-press" onClick={onStudy}>Go to Study</button>}
              </div>
            </div>
          ) : (
            <div className="notes">
              <input className="notes__search" type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search your notes" aria-label="Search your notes" />
              {groups.length === 0 && <p className="notes__none">No notes match “{query.trim()}”.</p>}
              {groups.map(g => (
                <section key={g.key} className="notes__lec">
                  <h2 className="notes__lec-h">
                    {g.path.length > 1 && <span className="notes__lec-path">{g.path.slice(0, -1).join(" › ")}</span>}
                    <span className="notes__lec-name">{g.path[g.path.length - 1] ?? g.key}</span>
                  </h2>
                  {g.topics.map(t => (
                    <div key={t.title ?? "_"} className="notes__topic">
                      {/* No topic heading when it only repeats the lecture's name. */}
                      {t.title && t.title.toLowerCase() !== String(g.path[g.path.length - 1] ?? "").toLowerCase()
                        && <h3 className="notes__topic-h">{t.title}</h3>}
                      <ul className="notes__list">
                        {t.items.map(({ q, note }) => (
                          <li key={q.id}>
                            <button type="button" className="notes__item" onClick={() => setView({ list: order, at: order.findIndex(x => x.q.id === q.id) })}>
                              <span className="notes__note">{note.body}</span>
                              <span className="notes__q">
                                <span className="notes__q-text">{q.q}</span>
                                <span className="notes__when">{ago(note.at)}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      {view && <Viewer list={view.list} at={view.at} onMove={i => setView(v => ({ ...v, at: i }))} onClose={() => setView(null)} />}
    </div>
  );
}
