import { useEffect, useRef } from "react";

/** Compact jump grid for an active session — lives in the Options sheet in focus mode. */
export default function QuestionNavigator({ queue, idx, sels, results, onJump, maxHeight }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [idx]);

  const answered = Object.keys(sels).length;

  return (
    <nav
      className="q-nav q-nav--sheet"
      aria-label="Question list"
      style={{ maxHeight: maxHeight ?? undefined }}
    >
      <div className="q-nav-head">
        <span className="q-nav-count">{answered}/{queue.length}</span>
        <span className="q-nav-label">answered</span>
      </div>

      <div className="q-nav-grid">
        {queue.map((_, i) => {
          const isCurrent = i === idx;
          const isAnswered = sels[i] !== undefined;
          const isCorrect = results[i]?.correct;
          let state = "idle";
          if (isCurrent) state = "current";
          else if (isAnswered) state = isCorrect ? "ok" : "bad";

          return (
            <button
              key={i}
              ref={isCurrent ? activeRef : null}
              type="button"
              onClick={() => onJump(i)}
              className={`q-nav-cell is-${state}`}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Question ${i + 1}${isAnswered ? (isCorrect ? ", correct" : ", wrong") : ""}`}
              title={`Question ${i + 1}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
