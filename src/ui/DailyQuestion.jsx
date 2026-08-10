import { useMemo, useState } from "react";
import { C, cardSolid, fieldBtn, shuffleOptions } from "./theme";

// The landing page's question card, made real.
//
// The dashboard used to report numbers and ask you to navigate somewhere to
// study. This puts the next question on the page itself, which is both the
// landing's strongest component and the answer to "what do I do now".
//
// Deliberately leaner than ui/QuestionCard — no bookmarking, editing, or copy.
// Those belong in a study session; here they are noise around a single question.

const KEYS = "ABCDE";
const QUEUE_LEN = 10;

/** Due cards first, then unseen, then whatever you've answered least. */
function buildQueue(questions, srCards, pStats, isDue) {
  const due = [];
  const unseen = [];
  const rest = [];

  for (const q of questions) {
    if (srCards[q.id] && isDue(srCards[q.id])) due.push(q);
    else if (!pStats[q.id]) unseen.push(q);
    else rest.push(q);
  }

  rest.sort((a, b) => (pStats[a.id]?.total || 0) - (pStats[b.id]?.total || 0));

  const pick = [...due, ...unseen, ...rest].slice(0, QUEUE_LEN);
  return pick.map(shuffleOptions);
}

export default function DailyQuestion({ questions, srCards, pStats, isDue, onAnswer, onOpenPractice }) {
  // Built once per mount: re-shuffling on every render would move the options
  // out from under whoever is mid-answer.
  const queue = useMemo(
    () => buildQueue(questions, srCards, pStats, isDue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState(null);

  const q = queue[idx];
  if (!q) return null;

  const answered = sel !== null;
  const correct = answered && sel === q.ans;

  function choose(i) {
    if (answered) return;
    setSel(i);
    onAnswer(q.id, i === q.ans);
  }

  function next() {
    setSel(null);
    setIdx(i => (i + 1) % queue.length);
  }

  return (
    <section
      className="anim-fade-up delay-100"
      style={{ ...cardSolid, padding: "26px 28px 24px" }}
      aria-label="Question of the moment"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: C.muted, letterSpacing: -0.1 }}>
          {q.deck} · {q.cat}
        </span>
        <span style={{ fontSize: 12, color: C.mutedDim, flexShrink: 0 }}>
          {idx + 1} / {queue.length}
        </span>
      </div>

      <h2 style={{
        marginTop: 12,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: -0.6,
        lineHeight: 1.28,
        color: C.text,
        maxWidth: "46ch",
      }}>
        {q.q}
      </h2>

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {q.opts.map((opt, i) => {
          const isAnswer = i === q.ans;
          const state = !answered ? "" : isAnswer ? "option-correct" : i === sel ? "option-wrong" : "option-faded";
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={answered}
              className={`option-btn ${state}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                background: "var(--c-card-bg)",
                border: "1.5px solid transparent",
                borderRadius: "var(--r-pill)",
                padding: "11px 16px",
                fontSize: 15,
                color: C.text,
                fontFamily: "inherit",
                cursor: answered ? "default" : "pointer",
              }}
            >
              <span style={{
                flex: "none",
                display: "grid",
                placeItems: "center",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: answered && isAnswer ? "#1f9d55" : answered && i === sel ? "#d64545" : "var(--c-card-solid)",
                color: answered && (isAnswer || i === sel) ? "#fff" : C.mutedDim,
                fontSize: 12.5,
                fontWeight: 700,
              }}>
                {KEYS[i]}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="anim-fade-up" style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: correct ? C.success : C.danger,
            letterSpacing: -0.2,
          }}>
            {correct ? "Correct." : `Not quite — the answer is ${KEYS[q.ans]}.`}
          </div>
          <p style={{ marginTop: 6, fontSize: 14.5, color: C.sub, lineHeight: 1.55, maxWidth: "62ch" }}>
            {q.exp}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <button onClick={next} className="btn-press" style={{ ...fieldBtn, background: C.accent, color: "#fff" }}>
              Next question <span aria-hidden="true">→</span>
            </button>
            <button
              onClick={onOpenPractice}
              className="btn-press"
              style={{
                padding: "12px 22px",
                background: "transparent",
                border: `1.5px solid ${C.accentBrd}`,
                borderRadius: "var(--r-pill)",
                color: C.accent,
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Start a full session
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
