import { useEffect, useMemo, useRef, useState } from "react";
import RichText from "./RichText";
import QuestionExhibit from "./QuestionExhibit";
import QuestionImage from "./QuestionImage";
import { TopicNote, stemSize } from "./QuestionCard";
import { qstem } from "./theme";

/**
 * Review mode of Manage questions (2026-11-24).
 *
 * The reviewer goes through a deck one lecture at a time, so they get into
 * the rhythm of its content: the lectures down the left with how far each
 * is done, the question on the right as Manage shows it (answer marked,
 * every why-wrong, the explanation and the topic note), and Accept or
 * Report in Practice's blue capsule.
 *
 * The question is Practice's answered card (2026-11-24, Rafil: "much more
 * focused"): one column, the right answer with the others behind "Show all
 * 5 options", the explanation, and the topic note folded to its first
 * line. Built from the card's own classes, without its tools, notes and
 * report button, which a reviewer does not need. Only questions nobody has reviewed yet
 * come up; Back steps through the ones just done, to change a call.
 *
 * Report asks what is wrong, then marks the question and puts the note in
 * its comments, where Manage's Reported list picks it up. Edit opens the
 * usual editor, and saving accepts the question.
 *
 * Keys: A accept, R report, E edit, ← back, Esc back to the list. Nothing
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

/* Practice's card, answered with the right answer, drawn straight on the
   window rather than as a card inside it. The other options start folded,
   whatever Practice is set to; opened, they stay open for the sitting. */
function ReviewCard({ q, where, showAll, onShowAll }) {
  return (
    <div className="q-card rq-card">
      {where && <p className="q-source">{where}</p>}
      <p className={`q-stem-review${stemSize(q.q)}`} style={{ ...qstem, marginBottom: 20 }}>{q.q}</p>
      <div className="q-body">
        <QuestionImage key={q.img || "none"} path={q.img} />
        <QuestionExhibit exhibit={q.exhibit} answered />
        <div className={q.ask ? "q-follow" : undefined} style={q.ask ? undefined : { display: "contents" }}>
          {q.ask && <p className="q-ask">{q.ask}</p>}
          <div className={`q-opts is-review${showAll ? "" : " is-collapsed"}`} role="list" aria-label="Answers">
            {q.opts.map((o, i) => {
              const ok = i === q.ans;
              if (!ok && !showAll) return null;
              return (
                <div key={i} role="listitem" className={`q-opt rq-opt is-${ok ? "correct" : "faded"}`}>
                  <div className="q-opt-row">
                    <span className="q-opt-letter" aria-hidden="true">{LETTERS[i]}</span>
                    <span className="q-opt-text">{o}</span>
                    {ok && <span className="q-opt-end"><span className="q-opt-mark ok" aria-label="Correct answer">✓</span></span>}
                  </div>
                  {!ok && q.optExp?.[i] && <div className="q-opt-note">{q.optExp[i]}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="q-review">
        {q.exp && <p className="q-exp">{q.exp}</p>}
        <div className="q-review-meta">
          <button type="button" className="q-allopts" onClick={() => onShowAll(!showAll)} aria-expanded={showAll}>
            {showAll ? "Hide other options" : `Show all ${q.opts.length} options`}
            <span className={`q-allopts-chev${showAll ? " is-open" : ""}`} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </button>
        </div>
        {q.topic?.title && q.topic?.body && <TopicNote key={q.id} topic={q.topic} hl={q.hl} qid={q.id} deckId={q.deckId} />}
      </div>
    </div>
  );
}

/* The deck's questions grouped by the deck each sits in (its lecture), in
   the deck's own order. */
function lecturesOf(all, deckId, deckName) {
  const by = new Map();
  for (const x of all) {
    const leaf = x.path?.length ? x.path[x.path.length - 1] : null;
    const id = leaf?.id ?? deckId;
    if (!by.has(id)) by.set(id, { id, name: id === deckId ? deckName : leaf.name, qs: [] });
    by.get(id).qs.push(x);
  }
  return [...by.values()];
}

export default function ReviewQueue({ all, deckId, deckName, statusOf, reports, where, onMark, onReport, onEdit }) {
  const lectures = useMemo(() => lecturesOf(all, deckId, deckName), [all, deckId, deckName]);
  const reviewed = x => statusOf(x) != null;
  const firstOpen = lec => lec?.qs.find(x => !reviewed(x)) ?? null;

  const [lecId, setLecId] = useState(() => (lectures.find(firstOpen) ?? lectures[0])?.id ?? null);
  const lec = lectures.find(l => l.id === lecId) ?? lectures[0] ?? null;
  const [curId, setCurId] = useState(() => firstOpen(lec)?.id ?? null);
  /* The questions done in this sitting, newest last, for Back. */
  const [trail, setTrail] = useState([]);
  /* The report being written, for the question it is about. */
  const [noteFor, setNoteFor] = useState(null);                 // { id, text } | null
  const note = noteFor && noteFor.id === curId ? noteFor.text : null;
  const setNote = text => setNoteFor(text == null ? null : { id: curId, text });
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const detailRef = useRef(null);
  const railRef = useRef(null);

  const q = curId != null ? all.find(x => x.id === curId) ?? null : null;
  const status = q ? statusOf(q) : null;
  const pos = q && lec ? lec.qs.findIndex(x => x.id === q.id) : -1;

  useEffect(() => { detailRef.current?.scrollTo?.({ top: 0 }); }, [curId]);
  useEffect(() => { railRef.current?.querySelector(".rq-lec.is-on")?.scrollIntoView({ block: "nearest" }); }, [lecId]);

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
    setLecId(l.id);
    setCurId((firstOpen(l) ?? l.qs[0])?.id ?? null);
  }

  async function accept() {
    if (!q || busy) return;
    setBusy(true);
    try { await onMark(q, "approved"); moveOn(q); } finally { setBusy(false); }
  }
  async function sendReport() {
    const body = (note ?? "").trim();
    if (!q || !body || busy) return;
    setBusy(true);
    try { await onReport(q, body); moveOn(q); } finally { setBusy(false); }
  }
  function back() {
    const prev = trail[trail.length - 1];
    if (prev == null) return;
    setTrail(t => t.slice(0, -1));
    const x = all.find(y => y.id === prev);
    if (!x) return;
    const owner = lectures.find(l => l.qs.some(y => y.id === prev));
    if (owner && owner.id !== lecId) setLecId(owner.id);
    setCurId(prev);
  }

  useEffect(() => {
    const onKey = e => {
      const t = e.target;
      if (e.key === "Escape" && note !== null) { e.preventDefault(); e.stopPropagation(); setNote(null); return; }
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft") { e.preventDefault(); back(); }
      else if (!q) return;
      else if (k === "a") { e.preventDefault(); accept(); }
      else if (k === "r") { e.preventDefault(); setNote(""); }
      else if (k === "e") { e.preventDefault(); onEdit(q, () => moveOn(q)); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  const doneIn = l => l.qs.filter(reviewed).length;
  const nextLecture = lec ? lectures.slice(lectures.indexOf(lec) + 1).concat(lectures.slice(0, lectures.indexOf(lec))).find(l => firstOpen(l)) : null;

  return (
    <div className="rq">
      <nav className="rq-rail" ref={railRef} aria-label="Lectures">
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

      <div className="rq-main">
        <section className="qr-detail rq-detail" ref={detailRef} aria-live="polite">
          {q ? (
            <>
              <ReviewCard q={q} where={where(q) || lec?.name} showAll={showAll} onShowAll={setShowAll} />
              {reports.get(q.id) && <StudentReports report={reports.get(q.id)} />}
              {status && <p className="qr-who">{status === "approved" ? "Accepted" : "Reported"}. Accept or report it again to change that.</p>}
              {note !== null && (
                <div className="rq-note">
                  <label className="qr-label" htmlFor="rq-note">What’s wrong with it?</label>
                  <textarea id="rq-note" className="np__field qr-input" rows={3} maxLength={2000} autoFocus value={note}
                    placeholder="For example: D could also be argued, because…"
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReport(); } }} />
                  <div className="rq-note__acts">
                    <button type="button" className="pss-btn btn-press is-primary" disabled={!note.trim() || busy} onClick={sendReport}>Report</button>
                    <button type="button" className="gen-link" onClick={() => setNote(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          ) : lec && (
            <div className="rq-done">
              <p className="rq-done__n">{lec.qs.length}<span>reviewed</span></p>
              <p className="rq-done__line">
                {lec.name} is done: {lec.qs.filter(x => statusOf(x) === "approved").length} accepted
                {lec.qs.some(x => statusOf(x) === "flagged") ? `, ${lec.qs.filter(x => statusOf(x) === "flagged").length} reported` : ""}.
              </p>
              {nextLecture
                ? <button type="button" className="pss-btn btn-press is-primary rq-done__next" onClick={() => openLecture(nextLecture)}>Next: {nextLecture.name}</button>
                : <p className="rq-done__line">Every lecture in {deckName} is reviewed.</p>}
            </div>
          )}
        </section>

        {q && note === null && (
          <div className="rq-dock">
            <div className="setup-next-bar rq-bar">
              <p className="setup-next-sel">{pos + 1} of {lec.qs.length} in this lecture</p>
              <span className="rq-bar__acts">
                {trail.length > 0 && <button type="button" className="rq-ghost" onClick={back} aria-label="Back to the last one">←</button>}
                <button type="button" className="rq-ghost" onClick={() => onEdit(q, () => moveOn(q))}>Edit</button>
                <button type="button" className="rq-ghost" onClick={() => setNote("")}>Report<kbd>R</kbd></button>
                <button type="button" className="setup-next-btn" disabled={busy} onClick={accept}>Accept<kbd>A</kbd></button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
