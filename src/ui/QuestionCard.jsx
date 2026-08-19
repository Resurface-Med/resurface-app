import { useState, useEffect } from "react";
import { C, qcard, qstem, primaryBtn } from "./theme";
import BmBtn from "./BmBtn";
import EditQuestionModal from "./EditQuestionModal";

/**
 * The question is the only solid object on the field.
 *
 * Options are a short list of peers — select, then submit — so the permanent
 * eliminate control on every row is hidden until hover/focus. Mid-answer chrome
 * (icons, “selected” labels) stays quiet so the stem and five choices dominate.
 * Accuracy feedback lives after the commit, not as a second dashboard.
 */
export default function QuestionCard({ q, sel, timedOut, onAnswer, onNext, onPrev, onToggleBookmark, isBookmarked, isLast, nextLabel, onSaveEdit }) {
  const answered = sel !== null || timedOut;

  const [pending, setPending] = useState(null);
  const [eliminated, setEliminated] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  function handleCopy() {
    const letters = "ABCDE";
    let text = q.q + "\n\n";
    text += q.opts.map((o, i) => `${letters[i]}. ${o}`).join("\n");

    if (answered) {
      text += `\n\n✓ Correct answer: ${letters[q.ans]} — ${q.opts[q.ans]}`;
      text += `\n\nExplanation: ${q.exp}`;
      if (q.optExp) {
        const wrongNotes = q.opts
          .map((_, i) => i !== q.ans && q.optExp[i] ? `${letters[i]}: ${q.optExp[i]}` : null)
          .filter(Boolean);
        if (wrongNotes.length) text += "\n\nWhy the others are wrong:\n" + wrongNotes.join("\n");
      }
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  useEffect(() => {
    setPending(null);
    setEliminated(new Set());
  }, [q?.id]);

  useEffect(() => {
    if (!q) return;

    function handleKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.key === "ArrowRight") { e.preventDefault(); onNext?.(); return; }
      if (e.key === "ArrowLeft")  { e.preventDefault(); onPrev?.(); return; }

      if (answered) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); onNext?.(); }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPending(prev => {
          const next = prev === null ? 0 : Math.min(q.opts.length - 1, prev + 1);
          return eliminated.has(next) ? prev : next;
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPending(prev => {
          const next = prev === null ? q.opts.length - 1 : Math.max(0, prev - 1);
          return eliminated.has(next) ? prev : next;
        });
        return;
      }

      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= q.opts.length) {
        e.preventDefault();
        const i = num - 1;
        if (!eliminated.has(i)) setPending(i);
        return;
      }

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (pending !== null) onAnswer(pending);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [q, answered, pending, eliminated, onAnswer, onNext, onPrev]);

  if (!q) return null;

  function handleOptionClick(i) {
    if (answered || eliminated.has(i)) return;
    setPending(i);
  }

  function toggleEliminate(e, i) {
    e.stopPropagation();
    if (answered) return;
    setEliminated(prev => {
      const s = new Set(prev);
      if (s.has(i)) { s.delete(i); }
      else { s.add(i); if (pending === i) setPending(null); }
      return s;
    });
  }

  const toolBtn = (active) => ({
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 6,
    borderRadius: 8,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: active ? C.success : C.mutedDim,
    transition: "color 0.15s, background 0.15s",
  });

  return (
    <>
    {editing && <EditQuestionModal q={q} onClose={() => setEditing(false)} onSave={(updated) => { setEditing(false); onSaveEdit?.(updated); }} />}
    <div style={qcard} className="q-card anim-scale-in">
      {/* No category label. "Hormone Signalling" printed above "Adrenergic
          receptors B1 are coupled to:" narrows the answer space before the
          options have been read — it is a hint the exam will not give you.
          The session header already states the scope you chose, which you
          know; what the individual question belongs to is the thing worth
          not saying. */}
      <div className="q-card-meta">
        <div className="q-card-tools">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit question"
            aria-label="Edit question"
            style={toolBtn(false)}
            className="q-tool"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M10.5 1.5L13.5 4.5L5 13H2V10L10.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy question"
            aria-label="Copy question"
            style={toolBtn(copied)}
            className="q-tool"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M2 8L6 12L13 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 4H3.5A1.5 1.5 0 002 5.5v8A1.5 1.5 0 003.5 15h6A1.5 1.5 0 0011 13.5V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
          </button>
          {onToggleBookmark && <BmBtn active={isBookmarked} onClick={onToggleBookmark} />}
        </div>
      </div>

      <p className="anim-fade-up delay-0" style={{ ...qstem, marginBottom: 20 }}>{q.q}</p>

      <div className="q-opts" role="listbox" aria-label="Answers">
        {q.opts.map((opt, i) => {
          const ok = i === q.ans;
          const picked = i === sel;
          const isPending = !answered && pending === i;
          const isElim = !answered && eliminated.has(i);

          let state = "idle";
          let animClass = `anim-fade-up delay-${(i + 1) * 50}`;
          if (answered) {
            animClass = "";
            if (ok) { state = "correct"; if (picked) animClass = "anim-pop"; }
            else if (picked) { state = "wrong"; animClass = "anim-shake"; }
            else state = "faded";
          } else if (isPending) {
            state = "pending";
          } else if (isElim) {
            state = "elim";
            animClass = "";
          } else {
            animClass += " option-btn";
          }

          const wrongNote = answered && !ok && q.optExp?.[i];

          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={isPending || picked}
              onClick={() => handleOptionClick(i)}
              className={`q-opt is-${state} ${animClass}`.trim()}
            >
              <div className="q-opt-row">
                <span className="q-opt-letter" aria-hidden="true">{"ABCDE"[i]}</span>
                <span className="q-opt-text">{opt}</span>

                {answered && ok && (
                  <span className="q-opt-mark ok anim-pop" aria-hidden="true">✓</span>
                )}
                {answered && picked && !ok && (
                  <span className="q-opt-mark bad" aria-hidden="true">✗</span>
                )}

                {!answered && (
                  <button
                    type="button"
                    className={`q-elim${isElim ? " is-on" : ""}`}
                    onClick={(e) => toggleEliminate(e, i)}
                    title="Rule out"
                    aria-label={isElim ? "Restore option" : "Rule out option"}
                    aria-pressed={isElim}
                  >
                    ✕
                  </button>
                )}
              </div>

              {wrongNote && (
                <div className={`q-opt-note${picked ? " is-picked" : ""}`}>
                  {wrongNote}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!answered && pending !== null && (
        <button
          type="button"
          className="anim-fade-up hover-lift btn-press"
          style={{ ...primaryBtn, width: "100%", marginTop: 14 }}
          onClick={() => onAnswer(pending)}
        >
          Submit answer
        </button>
      )}

      {timedOut && sel === null && (
        <div className="q-feedback is-timeout anim-shake">
          <b>Time&apos;s up.</b> Correct answer was <b>{"ABCDE"[q.ans]} — {q.opts[q.ans]}</b>
        </div>
      )}

      {answered && (
        <div className={`q-feedback anim-fade-up${sel === q.ans ? " is-ok" : " is-bad"}`}>
          <div className="q-feedback-title">
            {sel === q.ans
              ? "Correct"
              : timedOut && sel === null
                ? `Timed out — answer: ${"ABCDE"[q.ans]}`
                : `Incorrect — answer: ${"ABCDE"[q.ans]}`}
          </div>
          <div className="q-feedback-body">{q.exp}</div>
        </div>
      )}

      {answered && (
        <div className="q-nav-actions anim-fade-up delay-100">
          {onPrev && (
            <button type="button" className="q-back btn-press" onClick={onPrev}>
              ← Back
            </button>
          )}
          <button
            type="button"
            className="hover-lift btn-press"
            style={{ ...primaryBtn, flex: 1 }}
            onClick={onNext}
          >
            {isLast ? "Finish" : nextLabel || "Next →"}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
