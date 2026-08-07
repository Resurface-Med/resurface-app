import { useState } from "react";
import { C, pageWrap, card, h1, h2, primaryBtn } from "../../constants";
import ProgressBar from "./ProgressBar";
import GhostBtn from "./GhostBtn";

export default function SessionSummary({ results, title, onRestart, onChangeSettings, onDrillWrong }) {
  const [showWrong, setShowWrong] = useState(false);

  const total = results.length;
  const correct = results.filter(r => r.correct).length;
  const pct = total > 0 ? Math.round(correct / total * 100) : 0;
  const scoreCol = pct >= 70 ? C.success : pct >= 50 ? C.warning : C.danger;
  const message = pct >= 80 ? "Excellent work!" : pct >= 70 ? "Good effort!" : pct >= 50 ? "Keep grinding." : "More practice needed.";

  // Group by category, sorted worst first
  const byCat = {};
  for (const r of results) {
    if (!byCat[r.cat]) byCat[r.cat] = { correct: 0, total: 0 };
    byCat[r.cat].total++;
    if (r.correct) byCat[r.cat].correct++;
  }
  const catRows = Object.entries(byCat)
    .map(([cat, s]) => ({ cat, ...s, pct: Math.round(s.correct / s.total * 100) }))
    .sort((a, b) => a.pct - b.pct);

  const wrongOnes = results.filter(r => !r.correct);

  return (
    <div style={pageWrap}>
      <h1 className="anim-fade-up delay-0" style={h1}>{title}</h1>

      {/* Score card */}
      <div className="anim-scale-in delay-100" style={{ ...card, textAlign: "center", padding: "40px 32px" }}>
        <div className="anim-pop delay-300" style={{ fontSize: 80, fontWeight: 300, color: scoreCol, lineHeight: 1, letterSpacing: -4 }}>{pct}%</div>
        <div className="anim-fade-up delay-400" style={{ fontSize: 16, color: C.text, marginTop: 10, fontWeight: 400 }}>{message}</div>
        <div className="anim-fade-up delay-500" style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{correct} correct · {total - correct} wrong · {total} total</div>
      </div>

      {/* By topic */}
      <div className="anim-fade-up delay-200" style={card}>
        <div style={{ ...h2, marginTop: 0, marginBottom: 18 }}>By Topic</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {catRows.map(({ cat, correct: c, total: t, pct: p }, i) => {
            const col = p >= 70 ? C.success : p >= 50 ? C.warning : C.danger;
            return (
              <div key={cat} className={`anim-fade-up delay-${200 + i * 40}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: C.text }}>{cat}</span>
                  <span style={{ fontSize: 13, color: col, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{c}/{t} &nbsp;{p}%</span>
                </div>
                <ProgressBar value={p} colour={col} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Wrong questions toggle */}
      {wrongOnes.length > 0 && (
        <div className="anim-fade-up delay-300" style={card}>
          <button
            onClick={() => setShowWrong(v => !v)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              width: "100%", background: "none", border: "none", cursor: "pointer",
              padding: 0, fontFamily: "inherit",
            }}
          >
            <span style={{ ...h2, marginTop: 0, marginBottom: 0 }}>Review ({wrongOnes.length} missed)</span>
            <span style={{ color: C.muted, fontSize: 14, transition: "transform 0.2s", display: "inline-block", transform: showWrong ? "rotate(180deg)" : "none" }}>▾</span>
          </button>

          {showWrong && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {wrongOnes.map((r, i) => (
                <div key={r.id} className={`anim-fade-up delay-${i * 30}`} style={{
                  padding: "13px 16px", borderRadius: 12,
                  background: C.dangerDim, border: `1px solid ${C.dangerBrd}`,
                }}>
                  <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 6 }}>{r.q}</div>
                  <div style={{ fontSize: 13, color: C.success, fontWeight: 500 }}>
                    ✓ {r.correctAnswer}
                  </div>
                  {r.yourAnswer && (
                    <div style={{ fontSize: 13, color: C.danger, marginTop: 2 }}>
                      ✗ You chose: {r.yourAnswer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="anim-fade-up delay-400" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="hover-lift btn-press" style={{ ...primaryBtn, flex: 1 }} onClick={onRestart}>
          Practice Again
        </button>
        {onDrillWrong && wrongOnes.length > 0 && (
          <button className="hover-lift btn-press" onClick={() => onDrillWrong(wrongOnes.map(r => r.id))} style={{
            flex: 1, padding: "11px 20px", borderRadius: 12, border: `1px solid ${C.dangerBrd}`,
            background: C.dangerDim, color: C.danger,
            fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Redo {wrongOnes.length} Missed →
          </button>
        )}
        {onChangeSettings && <GhostBtn onClick={onChangeSettings}>Change Settings</GhostBtn>}
      </div>
    </div>
  );
}
