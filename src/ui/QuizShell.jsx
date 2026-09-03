import { useEffect, useRef, useState } from "react";

import ExplainChat from "./ExplainChat";
import QuestionCard from "./QuestionCard";
import QuestionNavigator from "./QuestionNavigator";

const JUMP_FILTERS = [
  { k: "all", label: "All questions" },
  { k: "ok", label: "Correct" },
  { k: "bad", label: "Incorrect" },
  { k: "current", label: "Current" },
  { k: "idle", label: "Unanswered" },
  { k: "saved", label: "Bookmarked" },
];

/**
 * Full-screen study mode: no sidebar, no question rail beside the card.
 * Inspired by focused revision tools — one stem, one set of options, one
 * progress line, and a quiet footer for Options / Check.
 */
export default function QuizShell({
  q,
  idx,
  queue,
  sel,
  sels,
  results,
  isBookmarked,
  bookmarks = [],
  isLast,
  onAnswer,
  onNext,
  onPrev,
  onJump,
  onToggleBookmark,
  onSaveEdit,
  onRequestExit,
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [jumpFilter, setJumpFilter] = useState("all");
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
    if (!optionsOpen) return;
    function onKey(e) {
      if (e.key === "Escape") setOptionsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [optionsOpen]);

  useEffect(() => {
    setAiOpen(false);
  }, [q?.id]);

  const progress = (idx + 1) / queue.length;
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
    <div className="quiz-shell" role="dialog" aria-modal="true" aria-label="Study session">
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

      <footer className="quiz-shell__footer">
        <div className="quiz-shell__footer-bar">
          <button
            type="button"
            className="quiz-shell__foot-btn btn-press"
            onClick={() => setOptionsOpen(true)}
          >
            Options
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

      {optionsOpen && (
        <div
          className="quiz-shell__sheet-scrim"
          onClick={() => setOptionsOpen(false)}
          role="presentation"
        >
          <div
            className="quiz-shell__sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="quiz-jump-title"
          >
            <div className="quiz-shell__sheet-head">
              <h2 id="quiz-jump-title" className="quiz-shell__sheet-title">Jump to question</h2>
              <button
                type="button"
                className="quiz-shell__sheet-close btn-press"
                onClick={() => setOptionsOpen(false)}
              >
                Done
              </button>
            </div>

            <div className="quiz-shell__filters" role="toolbar" aria-label="Filter questions">
              {JUMP_FILTERS.map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  className={`quiz-shell__filter is-${k}${jumpFilter === k ? " is-on" : ""}`}
                  aria-pressed={jumpFilter === k}
                  aria-label={label}
                  title={label}
                  onClick={() => setJumpFilter(k)}
                >
                  {k === "all" && "All"}
                  {k === "ok" && (
                    <span className="quiz-shell__filter-mark is-ok" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 6.2L5.1 8.2 9 3.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                  {k === "bad" && (
                    <span className="quiz-shell__filter-mark is-bad" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M4 4l4 4M8 4L4 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                  )}
                  {k === "current" && <span className="quiz-shell__filter-dot is-current" aria-hidden="true" />}
                  {k === "idle" && <span className="quiz-shell__filter-dot is-idle" aria-hidden="true" />}
                  {k === "saved" && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 2.5h8v12l-4-2.4-4 2.4v-12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            <QuestionNavigator
              queue={queue}
              idx={idx}
              sels={sels}
              results={results}
              bookmarks={bookmarks}
              filter={jumpFilter}
              onJump={(i) => {
                onJump(i);
                setOptionsOpen(false);
              }}
            />

            <button
              type="button"
              className={`quiz-shell__sheet-bm btn-press${isBookmarked ? " is-on" : ""}`}
              onClick={onToggleBookmark}
              aria-pressed={isBookmarked}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 2.5h8v12l-4-2.4-4 2.4v-12z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill={isBookmarked ? "currentColor" : "none"}
                />
              </svg>
              {isBookmarked ? "Bookmarked" : "Bookmark this question"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
