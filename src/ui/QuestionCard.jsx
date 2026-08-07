import { useState, useEffect } from "react";
import { C, card, primaryBtn } from "./theme";
import CatTag from "./CatTag";
import BmBtn from "./BmBtn";
import EditQuestionModal from "./EditQuestionModal";

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

  // Reset interaction state on each new question
  useEffect(() => {
    setPending(null);
    setEliminated(new Set());
  }, [q?.id]);

  // Keyboard handler — re-registers whenever relevant state changes
  useEffect(() => {
    if (!q) return;

    function handleKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      // Arrow left/right — navigate between questions (always available)
      if (e.key === "ArrowRight") { e.preventDefault(); onNext?.(); return; }
      if (e.key === "ArrowLeft")  { e.preventDefault(); onPrev?.(); return; }

      // After answering: space/enter → next
      if (answered) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); onNext?.(); }
        return;
      }

      // Arrow up/down — cycle through options
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

      // 1–5: select option
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= q.opts.length) {
        e.preventDefault();
        const i = num - 1;
        if (!eliminated.has(i)) setPending(i);
        return;
      }

      // Space / Enter: submit pending
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

  return (
    <>
    {editing && <EditQuestionModal q={q} onClose={() => setEditing(false)} onSave={(updated) => { setEditing(false); onSaveEdit?.(updated); }} />}
    <div style={card} className="anim-scale-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <CatTag label={q.cat} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Edit button */}
          <button
            onClick={() => setEditing(true)}
            title="Edit question"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "2px 4px", borderRadius: 4, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.mutedDim, transition: "color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = C.muted}
            onMouseLeave={e => e.currentTarget.style.color = C.mutedDim}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M10.5 1.5L13.5 4.5L5 13H2V10L10.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={handleCopy}
            title="Copy question"
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "2px 4px", borderRadius: 4, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: copied ? C.success : C.mutedDim,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { if (!copied) e.currentTarget.style.color = C.muted; }}
            onMouseLeave={e => { if (!copied) e.currentTarget.style.color = C.mutedDim; }}
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M2 8L6 12L13 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 4H3.5A1.5 1.5 0 002 5.5v8A1.5 1.5 0 003.5 15h6A1.5 1.5 0 0011 13.5V13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
          </button>
          {onToggleBookmark && <BmBtn active={isBookmarked} onClick={onToggleBookmark} />}
        </div>
      </div>

      <p className="anim-fade-up delay-0" style={{ fontSize: 19, fontWeight: 600, color: C.text, lineHeight: 1.7, marginBottom: 24 }}>{q.q}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.opts.map((opt, i) => {
          const ok = i === q.ans;
          const picked = i === sel;
          const isPending = !answered && pending === i;
          const isElim = !answered && eliminated.has(i);

          // Compute colours
          let bg = "transparent", brd = "var(--c-border)", col = C.text;
          let animClass = `anim-fade-up delay-${(i + 1) * 50}`;
          let extraClass = "";

          if (answered) {
            animClass = "";
            if (ok) {
              bg = C.successDim; brd = C.successBrd; col = C.success;
              extraClass = "option-correct";
              if (picked) animClass = "anim-pop";
            } else if (picked) {
              bg = C.dangerDim; brd = C.dangerBrd; col = C.danger;
              extraClass = "option-wrong";
              animClass = "anim-shake";
            } else {
              col = C.mutedDim; brd = "var(--c-overlay2)";
              extraClass = "option-faded";
            }
          } else if (isPending) {
            bg = C.accentDim; brd = C.accentBrd; col = C.accent;
            extraClass = "option-pending";
          } else if (isElim) {
            bg = "transparent"; brd = "var(--c-overlay)"; col = C.mutedDim;
            animClass = "";
          } else {
            animClass += " option-btn";
          }

          const wrongNote = answered && !ok && q.optExp?.[i];

          return (
            <button
              key={i}
              onClick={() => handleOptionClick(i)}
              className={`${animClass} ${extraClass}`.trim()}
              style={{
                display: "flex", flexDirection: "column", alignItems: "stretch",
                padding: "15px 18px", borderRadius: 12,
                cursor: answered ? "default" : "pointer",
                textAlign: "left", fontSize: 15, lineHeight: 1.55,
                background: bg, border: `1px solid ${brd}`,
                transition: "background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s",
                fontFamily: "inherit",
                opacity: isElim ? 0.4 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                {/* Letter badge */}
                <span style={{
                  fontWeight: 700, fontSize: 12, minWidth: 26, padding: "4px 7px",
                  borderRadius: 6, flexShrink: 0,
                  fontFamily: "monospace",
                  background: answered ? "transparent" : isPending ? "var(--c-accent-dim)" : C.surface2,
                  color: answered ? col : isPending ? C.accent : C.muted,
                }}>{"ABCDE"[i]}</span>

                {/* Option text */}
                <span style={{
                  flex: 1,
                  color: answered ? col : isPending ? C.accent : isElim ? C.mutedDim : C.text,
                  textDecoration: isElim ? "line-through" : "none",
                }}>{opt}</span>

                {/* Right indicator */}
                {answered && ok       && <span className="anim-pop" style={{ marginLeft: "auto", color: C.success, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                {answered && picked && !ok && <span style={{ marginLeft: "auto", color: C.danger, flexShrink: 0 }}>✗</span>}
                {!answered && isPending && <span style={{ marginLeft: "auto", fontSize: 11, color: C.accent, flexShrink: 0 }}>selected</span>}
                {/* X eliminate button */}
                {!answered && (
                  <button
                    onClick={(e) => toggleEliminate(e, i)}
                    style={{
                      marginLeft: isPending ? 8 : "auto",
                      flexShrink: 0,
                      cursor: "pointer", padding: "3px 6px",
                      color: isElim ? C.danger : C.muted,
                      fontSize: 11, lineHeight: 1,
                      opacity: isElim ? 1 : 0.7,
                      border: `1px solid ${isElim ? C.dangerBrd : "var(--c-border)"}`,
                      borderRadius: 5,
                      background: isElim ? C.dangerDim : "transparent",
                      transition: "opacity 0.15s, color 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = isElim ? "1" : "0.7"}
                    title="Rule out"
                  >✕</button>
                )}
              </div>

              {/* Distractor explanation */}
              {wrongNote && (
                <div style={{
                  marginTop: 8, marginLeft: 28,
                  paddingLeft: 10,
                  borderLeft: picked
                    ? `3px solid ${C.danger}`
                    : "2px solid var(--c-border)",
                  fontSize: 13, lineHeight: 1.65,
                  fontWeight: picked ? 600 : 400,
                  color: picked ? "#fca5a5" : C.sub,
                }}>
                  {wrongNote}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Keyboard hint */}
      {!answered && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.mutedDim, textAlign: "center", letterSpacing: 0.2 }}>
          {pending !== null
            ? "Enter to submit · → to skip"
            : "↑↓ to select · 1–5 · Enter to submit · → skip · ← back"}
        </div>
      )}

      {/* Submit button */}
      {!answered && pending !== null && (
        <button className="anim-fade-up hover-lift btn-press" style={{ ...primaryBtn, width: "100%", marginTop: 12 }} onClick={() => onAnswer(pending)}>
          Submit Answer
        </button>
      )}

      {/* Time's up banner */}
      {timedOut && sel === null && (
        <div className="anim-shake" style={{ marginTop: 14, padding: "13px 16px", background: C.dangerDim, border: `1px solid ${C.dangerBrd}`, borderRadius: 12, fontSize: 13, color: C.danger }}>
          <b>Time's up!</b> The correct answer was <b>{"ABCDE"[q.ans]} — {q.opts[q.ans]}</b>
        </div>
      )}

      {/* Explanation box */}
      {answered && (
        <div className="anim-fade-up" style={{
          marginTop: 14, padding: "16px 18px",
          background: "var(--c-accent-dim)",
          border: "1px solid var(--c-accent-brd)",
          borderRadius: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: sel === q.ans ? C.success : C.danger, marginBottom: 8 }}>
            {sel === q.ans
              ? "✓ Correct!"
              : timedOut && sel === null
                ? `Timed out — Answer: ${"ABCDE"[q.ans]}`
                : `✗ Incorrect — correct answer: ${"ABCDE"[q.ans]}`}
          </div>
          <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.75 }}>{q.exp}</div>
        </div>
      )}

      {/* Next button */}
      {answered && (
        <div className="anim-fade-up delay-100" style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {onPrev && (
            <button className="hover-lift btn-press" onClick={onPrev} style={{
              padding: "11px 18px", borderRadius: 12, border: "1px solid var(--c-border)",
              background: "transparent", color: C.sub, fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s, color 0.15s",
              flexShrink: 0,
            }}>← Back</button>
          )}
          <button className="hover-lift btn-press" style={{ ...primaryBtn, flex: 1 }} onClick={onNext}>
            {isLast ? "Finish" : nextLabel || "Next →"}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
