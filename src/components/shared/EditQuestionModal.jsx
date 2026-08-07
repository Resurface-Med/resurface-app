import { useState } from "react";
import { C, primaryBtn } from "../../constants";
import { questionEditsStore } from "../../utils/storage";

const LETTERS = ["A", "B", "C", "D", "E"];

const inputStyle = {
  width: "100%", background: "var(--c-surface2)",
  border: "1px solid var(--c-border)", borderRadius: 8,
  padding: "8px 12px", color: "var(--c-text)", fontSize: 13,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  resize: "vertical",
};

const labelStyle = {
  fontSize: 11, fontWeight: 600, color: "var(--c-muted)",
  letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, display: "block",
};

export default function EditQuestionModal({ q, onClose, onSave }) {
  const [question, setQuestion]   = useState(q.q);
  const [opts, setOpts]           = useState([...q.opts]);
  const [ans, setAns]             = useState(q.ans);
  const [exp, setExp]             = useState(q.exp);
  const [optExp, setOptExp]       = useState(
    q.optExp ? [...q.optExp].map(e => e ?? "") : Array(q.opts.length).fill("")
  );

  function setOpt(i, val) { setOpts(o => o.map((v, j) => j === i ? val : v)); }
  function setOptExpItem(i, val) { setOptExp(o => o.map((v, j) => j === i ? val : v)); }

  function handleSave() {
    const updated = {
      q: question.trim(),
      opts: opts.map(o => o.trim()),
      ans,
      exp: exp.trim(),
      optExp: optExp.map((e, i) => i === ans ? null : (e.trim() || null)),
    };
    questionEditsStore.set(q.id, updated);
    onSave({ ...q, ...updated });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1500,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--c-card-bg)",
        border: "1px solid var(--c-border)",
        borderRadius: 20, padding: "28px 28px",
        width: "100%", maxWidth: 640,
        maxHeight: "calc(var(--app-vh) * 0.9)", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", gap: 20,
      }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--c-text)" }}>Edit Question</div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: C.muted, fontSize: 20, lineHeight: 1, padding: "2px 6px",
          }}>×</button>
        </div>

        {/* Question text */}
        <div>
          <label style={labelStyle}>Question</label>
          <textarea
            value={question} onChange={e => setQuestion(e.target.value)}
            rows={3} style={inputStyle}
          />
        </div>

        {/* Options + correct answer */}
        <div>
          <label style={labelStyle}>Options — select the correct answer</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opts.map((opt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, cursor: "pointer" }}>
                  <input
                    type="radio" name="correct-ans" checked={ans === i}
                    onChange={() => setAns(i)}
                    style={{ accentColor: C.accent, width: 14, height: 14 }}
                  />
                  <span style={{
                    fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                    color: ans === i ? C.accent : C.muted,
                    width: 16,
                  }}>{LETTERS[i]}</span>
                </label>
                <input
                  type="text" value={opt} onChange={e => setOpt(i, e.target.value)}
                  style={{
                    ...inputStyle, resize: "none",
                    border: `1px solid ${ans === i ? C.accentBrd : "var(--c-border)"}`,
                    background: ans === i ? "var(--c-accent-dim)" : "var(--c-surface2)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Explanation */}
        <div>
          <label style={labelStyle}>Explanation</label>
          <textarea
            value={exp} onChange={e => setExp(e.target.value)}
            rows={3} style={inputStyle}
          />
        </div>

        {/* Per-option explanations */}
        <div>
          <label style={labelStyle}>Why each wrong answer is wrong</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opts.map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                  color: ans === i ? C.success : C.muted,
                  flexShrink: 0, width: 16,
                }}>{LETTERS[i]}</span>
                {ans === i ? (
                  <div style={{ ...inputStyle, color: C.muted, fontStyle: "italic", opacity: 0.6 }}>
                    Correct answer — no explanation needed
                  </div>
                ) : (
                  <input
                    type="text" value={optExp[i]}
                    onChange={e => setOptExpItem(i, e.target.value)}
                    placeholder={`Why ${LETTERS[i]} is wrong...`}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} className="btn-press hover-lift" style={{ ...primaryBtn, flex: 1 }}>
            Save &amp; Reload
          </button>
          <button onClick={onClose} className="btn-press" style={{
            padding: "11px 20px", borderRadius: 12,
            border: "1px solid var(--c-border)", background: "transparent",
            color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
        </div>

      </div>
    </div>
  );
}
