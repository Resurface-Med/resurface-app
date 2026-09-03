import { useEffect, useRef, useState } from "react";

import ExplainChat from "./ExplainChat";
import QuestionCard from "./QuestionCard";
import QuestionNavigator from "./QuestionNavigator";

/**
 * Full-screen study mode: no sidebar until you ask for the question list.
 */
export default function QuizShell({
  q,
  idx,
  queue,
  sel,
  sels,
  results,
  isBookmarked,
  isLast,
  onAnswer,
  onNext,
  onPrev,
  onJump,
  onToggleBookmark,
  onSaveEdit,
  onRequestExit,
}) {
  const [railOpen, setRailOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [controls, setControls] = useState({
    pending: null,
    answered: false,
    canSubmit: false,
    submit: null,
    next: null,
  });
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!railOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setRailOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railOpen]);

  useEffect(() => {
    setAiOpen(false);
  }, [q?.id]);

  const progress = (idx + 1) / queue.length;
  const answered = Object.keys(sels).length;
  const wrong = sel !== null && sel !== q.ans;
  const showAi = aiOpen && wrong;
  const canCheck = !controls.answered && controls.canSubmit;
  const primaryLabel = canCheck
    ? "Check"
    : (isLast ? "Finish" : "Next");

  function handlePrimary() {
    if (canCheck) controls.submit?.();
    else onNext?.();
  }

  return (
    <div className={`quiz-shell${railOpen ? " is-rail" : ""}${showAi ? " is-ai" : ""}`} role="dialog" aria-modal="true" aria-label="Study session">
      <header className="quiz-shell__header">
        <button
          type="button"
          className="quiz-shell__close btn-press"
          onClick={onRequestExit}
          aria-label="Leave session"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="quiz-shell__progress-wrap">
          <div className="quiz-shell__progress" aria-hidden="true">
            <div
              className="quiz-shell__progress-fill"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <span className="quiz-shell__count">
            {idx + 1}/{queue.length}
          </span>
        </div>
      </header>

      <div className="quiz-shell__stage">
        {railOpen && (
          <aside className="quiz-rail" aria-label="Session progress">
            <div className="quiz-rail__head">
              <h2 className="quiz-rail__title">Questions</h2>
              <span className="quiz-rail__count">{answered}/{queue.length}</span>
            </div>
            <div className="quiz-rail__bar" aria-hidden="true">
              <div
                className="quiz-rail__bar-fill"
                style={{ transform: `scaleX(${answered / queue.length})` }}
              />
            </div>
            <QuestionNavigator
              queue={queue}
              idx={idx}
              sels={sels}
              results={results}
              onJump={onJump}
            />
            <button
              type="button"
              className={`quiz-rail__bm btn-press${isBookmarked ? " is-on" : ""}`}
              onClick={onToggleBookmark}
              aria-pressed={isBookmarked}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 2.5h8v12l-4-2.4-4 2.4v-12z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill={isBookmarked ? "currentColor" : "none"}
                />
              </svg>
              {isBookmarked ? "Bookmarked" : "Bookmark"}
            </button>
          </aside>
        )}

        {railOpen && (
          <button
            type="button"
            className="quiz-rail__scrim"
            aria-label="Close questions"
            onClick={() => setRailOpen(false)}
          />
        )}

        <div ref={bodyRef} className={`quiz-shell__body${showAi ? " has-ai" : ""}`}>
          <div className="quiz-shell__main">
            <QuestionCard
              key={q.id}
              q={q}
              sel={sel}
              onAnswer={onAnswer}
              onNext={onNext}
              onPrev={onPrev}
              onToggleBookmark={onToggleBookmark}
              isBookmarked={isBookmarked}
              isLast={isLast}
              nextLabel="Next question"
              onSaveEdit={onSaveEdit}
              focusMode
              hideActions
              aiOpen={aiOpen}
              onAiOpenChange={setAiOpen}
              onControlsChange={setControls}
            />
          </div>
          {showAi && (
            <ExplainChat q={q} picked={sel} onClose={() => setAiOpen(false)} />
          )}
        </div>
      </div>

      <footer className="quiz-shell__footer">
        <div className="quiz-shell__footer-bar">
          <button
            type="button"
            className={`quiz-shell__foot-btn btn-press${railOpen ? " is-on" : ""}`}
            aria-pressed={railOpen}
            onClick={() => setRailOpen(v => !v)}
          >
            Questions
          </button>
          <button
            type="button"
            className="quiz-shell__foot-btn quiz-shell__foot-btn--primary btn-press"
            onClick={handlePrimary}
          >
            {primaryLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
