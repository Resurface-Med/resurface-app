import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import RichText from "./RichText";
import QuestionExhibit from "./QuestionExhibit";
import QuestionImage from "./QuestionImage";
import QuestionCard from "./QuestionCard";
import NavChevron from "./NavChevron";
import Wave from "./Wave";

/**
 * Review (2026-11-24): the admin team going through a deck one lecture at a
 * time, from the Review button in Manage questions.
 *
 * Full screen, in Practice's session shell (Rafil: "just like the question
 * flow"): the blue bar with the lecture's progress, the question as the
 * answered card (QuestionCard, `bare`), and the bar along the bottom with
 * back and forward, Report and Accept. The deck's lectures are the slide-out
 * list on the left, each with how far it is done. Only questions nobody has
 * reviewed come up; back steps through the ones just done, to change a call.
 *
 * Report asks what is wrong (the app's popup), then flags the question with
 * the note as a comment, where Manage's Reported list shows it. Edit is the
 * pencil in the top bar; saving from here accepts the question.
 *
 * Keys: A accept, R report, ← back, → skip, Esc back to the list. Nothing
 * fires while typing.
 */
const LETTERS = "ABCDE";

/* The question as Manage shows it, shared by both modes. */
export function QuestionBody({ q, where, report }) {
  return (
    <>
      <p className="qr-where">{where}</p>
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
    </>
  );
}

function StudentReports({ report }) {
  return (
    <div className="qr-report rq-reports">
      <span className="qr-label">Reported by {report.flags} {Number(report.flags) === 1 ? "student" : "students"}</span>
      <ul>
        {(report.reporters ?? []).map((r, i) => (
          <li key={i}>{r.name || "A student"}{r.note ? `: “${r.note}”` : ""}</li>
        ))}
      </ul>
    </div>
  );
}

/* The deck's questions grouped by the deck each sits in (its lecture), in
   the deck's own order. */
export function lecturesOf(all, deckId, deckName) {
  const by = new Map();
  for (const x of all) {
    const leaf = x.path?.length ? x.path[x.path.length - 1] : null;
    const id = leaf?.id ?? deckId;
    if (!by.has(id)) by.set(id, { id, name: id === deckId ? deckName : leaf.name, qs: [] });
    by.get(id).qs.push(x);
  }
  return [...by.values()];
}


const RAIL_KEY = "rs-review-rail";
/* Open on a laptop unless it was last closed; shut on a phone, where it
   covers the question. */
const railKept = () => {
  if (typeof window !== "undefined" && window.innerWidth <= 900) return false;
  try { return localStorage.getItem(RAIL_KEY) !== "0"; } catch { return true; }
};

export default function ReviewQueue({ all, deckId, deckName, statusOf, reports, onMark, onReport, onEdit, onExit }) {
  const lectures = useMemo(() => lecturesOf(all, deckId, deckName), [all, deckId, deckName]);
  const reviewed = x => statusOf(x) != null;
  const firstOpen = lec => lec?.qs.find(x => !reviewed(x)) ?? null;

  const [lecId, setLecId] = useState(() => (lectures.find(firstOpen) ?? lectures[0])?.id ?? null);
  const lec = lectures.find(l => l.id === lecId) ?? lectures[0] ?? null;
  const [curId, setCurId] = useState(() => firstOpen(lec)?.id ?? null);
  /* The questions done in this sitting, newest last, for back. */
  const [trail, setTrail] = useState([]);
  /* The report being written, for the question it is about. */
  const [noteFor, setNoteFor] = useState(null);                 // { id, text } | null
  const note = noteFor && noteFor.id === curId ? noteFor.text : null;
  const setNote = text => setNoteFor(text == null ? null : { id: curId, text });
  const [busy, setBusy] = useState(false);
  const [railOpen, setRailOpen] = useState(railKept);
  const toggleRail = () => setRailOpen(o => {
    try { localStorage.setItem(RAIL_KEY, o ? "0" : "1"); } catch { /* this visit only */ }
    return !o;
  });

  const q = curId != null ? all.find(x => x.id === curId) ?? null : null;
  const status = q ? statusOf(q) : null;
  const doneIn = l => l.qs.filter(reviewed).length;
  const doneAll = all.filter(reviewed).length;

  /* The next question nobody has reviewed in this lecture, after `from`
     and then from the top; null when the lecture is done. */
  function nextOpen(from, l = lec) {
    if (!l) return null;
    const i = l.qs.findIndex(x => x.id === from);
    const order = [...l.qs.slice(i + 1), ...l.qs.slice(0, Math.max(i, 0))];
    return order.find(x => x.id !== from && !reviewed(x)) ?? null;
  }
  function moveOn(done) {
    setTrail(t => [...t.filter(id => id !== done.id), done.id]);
    setCurId(nextOpen(done.id)?.id ?? null);
  }
  function openLecture(l) {
    if (typeof window !== "undefined" && window.innerWidth <= 900) setRailOpen(false);
    setLecId(l.id);
    setCurId((firstOpen(l) ?? l.qs[0])?.id ?? null);
  }
  /* Forward without a decision: the next one still to do. */
  function skip() {
    if (!q) return;
    const n = nextOpen(q.id);
    if (n) setCurId(n.id);
  }

  async function accept() {
    if (!q || busy) return;
    setBusy(true);
    try { await onMark(q, "approved"); moveOn(q); } catch { /* put back by onMark */ } finally { setBusy(false); }
  }
  async function sendReport() {
    const body = (note ?? "").trim();
    if (!q || !body || busy) return;
    setBusy(true);
    try { await onReport(q, body); setNoteFor(null); moveOn(q); } catch { /* put back by onMark */ } finally { setBusy(false); }
  }
  function back() {
    const prev = trail[trail.length - 1];
    if (prev == null) return;
    setTrail(t => t.slice(0, -1));
    const owner = lectures.find(l => l.qs.some(y => y.id === prev));
    if (owner && owner.id !== lecId) setLecId(owner.id);
    setCurId(prev);
  }

  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (note !== null) setNoteFor(null); else onExit();
        return;
      }
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || note !== null || !q) return;
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); accept(); }
      else if (k === "r") { e.preventDefault(); setNote(""); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  const nextLecture = lec ? lectures.slice(lectures.indexOf(lec) + 1).concat(lectures.slice(0, lectures.indexOf(lec))).find(l => firstOpen(l)) : null;
  const lecDone = lec ? doneIn(lec) : 0;

  return createPortal(
    <div className={`quiz-shell rv${railOpen ? " is-rail" : ""}`} role="dialog" aria-modal="true" aria-label={`Review ${deckName}`}>
      <header className="quiz-shell__header">
        <button type="button" className="quiz-shell__close btn-press" onClick={onExit} aria-label="Back to the questions list">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="quiz-shell__progress-wrap">
          <div className="quiz-shell__progress" aria-hidden="true">
            <div className="quiz-shell__progress-fill" style={{ transform: `scaleX(${lec ? lecDone / lec.qs.length : 0})` }} />
          </div>
          <span className="quiz-shell__count rv-count">
            {lec && <span className="rv-count__lec">{lec.name}</span>}
            <span>{lecDone}/{lec?.qs.length ?? 0}</span>
          </span>
          {q && (
            <button type="button" className="quiz-shell__tool btn-press" onClick={() => onEdit(q, () => moveOn(q))} title="Edit question" aria-label="Edit question">
              <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M10.5 1.5L13.5 4.5L5 13H2V10L10.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </header>
      <Wave from="var(--c-bg)" to="var(--c-surface2)" height="clamp(16px, min(3.2vw, 4.2vh), 46px)" />

      <div className="quiz-shell__stage">
        {railOpen && (
          <aside className="quiz-rail" aria-label="Lectures">
            <div className="quiz-rail__inner">
              <div className="quiz-rail__head">
                <h2 className="quiz-rail__title">{deckName}</h2>
                <span className="rv-total">{doneAll}/{all.length}</span>
              </div>
              <div className="quiz-rail__bar" aria-hidden="true">
                <div className="quiz-rail__bar-fill" style={{ transform: `scaleX(${all.length ? doneAll / all.length : 0})` }} />
              </div>
              <nav className="rv-lecs">
                {lectures.map(l => {
                  const n = doneIn(l);
                  const complete = n === l.qs.length;
                  return (
                    <button key={l.id} type="button" className={`rq-lec${l.id === lec?.id ? " is-on" : ""}${complete ? " is-done" : ""}`} onClick={() => openLecture(l)}>
                      <span className="rq-lec__name">{l.name}</span>
                      <span className="rq-lec__n">{complete ? `✓ ${l.qs.length}` : `${n} / ${l.qs.length}`}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}
        <button type="button" className={`quiz-rail-toggle btn-press${railOpen ? " is-on" : ""}`} onClick={toggleRail}
          title={railOpen ? "Hide the lectures" : "Show the lectures"} aria-label={railOpen ? "Hide the lectures" : "Show the lectures"} aria-expanded={railOpen}>
          {railOpen ? <PanelLeftClose size={20} strokeWidth={2} aria-hidden="true" /> : <PanelLeftOpen size={20} strokeWidth={2} aria-hidden="true" />}
        </button>

        {railOpen && <button type="button" className="quiz-rail__scrim" aria-label="Close the lectures" onClick={toggleRail} />}

        <div className="quiz-shell__body">
          <div className="quiz-shell__main">
            {q ? (
              <>
                <QuestionCard key={q.id} q={q} sel={q.ans} onAnswer={() => {}} onNext={skip} onPrev={trail.length ? back : undefined}
                  focusMode hideActions bare />
                {reports.get(q.id) && <StudentReports report={reports.get(q.id)} />}
                {status && <p className="rv-status">{status === "approved" ? "You accepted this." : "You reported this."} Accept or report it again to change that.</p>}
              </>
            ) : lec && (
              <div className="rq-done">
                <p className="rq-done__n">{lec.qs.length}<span>reviewed</span></p>
                <p className="rq-done__line">
                  {lec.name} is done: {lec.qs.filter(x => statusOf(x) === "approved").length} accepted
                  {lec.qs.some(x => statusOf(x) === "flagged") ? `, ${lec.qs.filter(x => statusOf(x) === "flagged").length} reported` : ""}.
                </p>
                {!nextLecture && <p className="rq-done__line">Every lecture in {deckName} is reviewed.</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="quiz-shell__footer">
        <div className="quiz-shell__footer-bar">
          <div className="quiz-shell__nav quiz-pair" role="group" aria-label="Move between questions">
            <button type="button" className="quiz-pair__btn btn-press" onClick={back} disabled={!trail.length} aria-label="Back to the last one">
              <NavChevron back />
            </button>
            <span className="quiz-pair__rule" aria-hidden="true" />
            <button type="button" className="quiz-pair__btn btn-press" onClick={skip} disabled={!q} aria-label="Skip for now">
              <NavChevron />
            </button>
          </div>
          <div className="quiz-shell__foot-right">
            {q ? (
              <>
                <button type="button" className="quiz-shell__foot-btn btn-press rv-report" onClick={() => setNote("")}>Report</button>
                <button type="button" className="quiz-shell__foot-btn quiz-shell__foot-btn--primary btn-press" disabled={busy} onClick={accept}>Accept</button>
              </>
            ) : nextLecture ? (
              <button type="button" className="quiz-shell__foot-btn quiz-shell__foot-btn--primary btn-press" onClick={() => openLecture(nextLecture)}>Next: {nextLecture.name}</button>
            ) : (
              <button type="button" className="quiz-shell__foot-btn quiz-shell__foot-btn--primary btn-press" onClick={onExit}>Back to the list</button>
            )}
          </div>
        </div>
      </footer>

      {note !== null && (
        <div className="np-scrim rv-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setNoteFor(null); }}>
          <form className="np" role="dialog" aria-modal="true" aria-label="Report this question" onSubmit={e => { e.preventDefault(); sendReport(); }}>
            <label className="np__label is-first is-top" htmlFor="rv-note">What’s wrong with it?</label>
            <textarea id="rv-note" className="np__field is-labelled rv-note" rows={4} maxLength={2000} autoFocus value={note}
              placeholder="For example: D could also be argued, because…"
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReport(); } }} />
            <p className="np__hint">It goes to the Reported list in Manage questions, with this note.</p>
            <div className="np__row">
              <button type="submit" className="np__save btn-press" disabled={!note.trim() || busy}>{busy ? "Reporting…" : "Report"}</button>
            </div>
          </form>
        </div>
      )}
    </div>,
    document.body,
  );
}
