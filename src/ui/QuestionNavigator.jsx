import { useEffect, useRef } from "react";

function rowState(i, idx, sels, results) {
  const answered = sels[i] !== undefined;
  if (i === idx) return "current";
  if (answered) return results[i]?.correct ? "ok" : "bad";
  return "idle";
}

/** Left-rail jump list for an active session. */
export default function QuestionNavigator({ queue, idx, sels, results, onJump }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [idx]);

  return (
    <nav className="quiz-rail__list" aria-label="Questions">
      {queue.map((_, i) => {
        const state = rowState(i, idx, sels, results);
        const isCurrent = i === idx;
        return (
          <button
            key={i}
            ref={isCurrent ? activeRef : null}
            type="button"
            onClick={() => onJump(i)}
            className={`quiz-rail__row is-${state}`}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={`Question ${i + 1}${state === "ok" ? ", correct" : state === "bad" ? ", wrong" : isCurrent ? ", current" : ""}`}
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
            Question {i + 1}
          </button>
        );
      })}
    </nav>
  );
}
