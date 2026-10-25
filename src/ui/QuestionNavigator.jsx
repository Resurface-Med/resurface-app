import { useEffect, useRef } from "react";

function rowState(i, idx, sels, results) {
  const answered = sels[i] !== undefined;
  if (i === idx) return "current";
  if (answered) return results[i]?.correct ? "ok" : "bad";
  return "idle";
}

function FlagMark() {
  return (
    <svg className="quiz-rail__flag" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2.2v11.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.6 3h7.4L10.2 5.7 12 8.4H4.6V3z" fill="currentColor" />
    </svg>
  );
}

/** Left-rail jump list for an active session. */
export default function QuestionNavigator({ queue, idx, sels, results, flagged, onJump }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [idx]);

  return (
    <nav className="quiz-rail__list" aria-label="Questions">
      {queue.map((_, i) => {
        const state = rowState(i, idx, sels, results);
        const isCurrent = i === idx;
        const isFlagged = flagged?.has(queue[i].id);
        return (
          <button
            key={i}
            ref={isCurrent ? activeRef : null}
            type="button"
            onClick={() => onJump(i)}
            className={`quiz-rail__row is-${state}${isFlagged ? " is-flagged" : ""}`}
            /* The app's own stagger, so the cascade matches every other list
               here. Capped at 14: past that the tail of a long queue is still
               arriving after the drawer has finished opening, which reads as
               the list struggling rather than cascading — the same cap the
               leaderboard already applies for the same reason. */
            data-in="left"
            style={{ "--i": Math.min(i, 14), "--step": "26ms" }}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={`Question ${i + 1}${state === "ok" ? ", correct" : state === "bad" ? ", wrong" : isCurrent ? ", current" : ""}${isFlagged ? ", flagged" : ""}`}
          >
            <span className="quiz-rail__mark" aria-hidden="true">
              {state === "ok" ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6.2L5.1 8.2 9 3.8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : state === "bad" ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4 4l4 4M8 4L4 8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className="quiz-rail__label">Question {i + 1}</span>
            {isFlagged ? <FlagMark /> : null}
          </button>
        );
      })}
    </nav>
  );
}
