import { useEffect, useRef } from "react";

function cellState(i, idx, sels, results) {
  const isCurrent = i === idx;
  const isAnswered = sels[i] !== undefined;
  const isCorrect = results[i]?.correct;
  if (isCurrent) return "current";
  if (isAnswered) return isCorrect ? "ok" : "bad";
  return "idle";
}

function matchesFilter(filter, i, idx, sels, results, bookmarked) {
  const answered = sels[i] !== undefined;
  const correct = !!results[i]?.correct;
  if (filter === "all") return true;
  if (filter === "saved") return bookmarked;
  if (filter === "current") return i === idx;
  if (filter === "idle") return !answered;
  if (filter === "ok") return answered && correct;
  if (filter === "bad") return answered && !correct;
  return true;
}

/** Compact jump grid for an active session — lives in the Options sheet. */
export default function QuestionNavigator({
  queue,
  idx,
  sels,
  results,
  onJump,
  maxHeight,
  filter = "all",
  bookmarks = [],
}) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [idx, filter]);

  const cells = queue.map((q, i) => {
    const state = cellState(i, idx, sels, results);
    const bookmarked = bookmarks.includes(q.id);
    if (!matchesFilter(filter, i, idx, sels, results, bookmarked)) return null;
    const isCurrent = i === idx;
    return (
      <button
        key={i}
        ref={isCurrent ? activeRef : null}
        type="button"
        onClick={() => onJump(i)}
        className={`q-nav-cell is-${state}${bookmarked ? " is-saved" : ""}`}
        aria-current={isCurrent ? "true" : undefined}
        aria-label={`Question ${i + 1}${state === "ok" ? ", correct" : state === "bad" ? ", wrong" : state === "current" ? ", current" : ", unanswered"}${bookmarked ? ", bookmarked" : ""}`}
        title={`Question ${i + 1}`}
      >
        {i + 1}
      </button>
    );
  }).filter(Boolean);

  return (
    <nav
      className="q-nav q-nav--sheet"
      aria-label="Question list"
      style={{ maxHeight: maxHeight ?? undefined }}
    >
      {cells.length ? (
        <div className="q-nav-grid">{cells}</div>
      ) : (
        <p className="q-nav-empty">Nothing in this filter.</p>
      )}
    </nav>
  );
}
