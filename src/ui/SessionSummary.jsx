import { useState } from "react";
import { C, h1, pageSub, sectionH, body, meta, primaryBtn, fieldBtn, btnGhost } from "./theme";
import ProgressBar from "./ProgressBar";
import Wave from "./Wave";

function toneForPct(pct) {
  if (pct >= 80) return { ink: C.success, wash: C.successDim, border: C.successBrd, label: "Strong finish" };
  if (pct >= 60) return { ink: C.accent, wash: C.accentDim, border: C.accentBrd, label: "Solid base" };
  return { ink: C.danger, wash: C.dangerDim, border: C.dangerBrd, label: "Needs another pass" };
}

function summaryLine(pct) {
  if (pct >= 80) return "You can move on, then revisit later.";
  if (pct >= 60) return "You are close. A short second pass should do it.";
  return "Keep this one in rotation until the pattern sticks.";
}

export default function SessionSummary({ results, title, onRestart, onChangeSettings, onDrillWrong }) {
  const [showWrong, setShowWrong] = useState(false);

  const total = results.length;
  const correct = results.filter(r => r.correct).length;
  const wrong = total - correct;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const tone = toneForPct(pct);

  const byCat = {};
  for (const r of results) {
    if (!byCat[r.cat]) byCat[r.cat] = { correct: 0, total: 0 };
    byCat[r.cat].total += 1;
    if (r.correct) byCat[r.cat].correct += 1;
  }

  const catRows = Object.entries(byCat)
    .map(([cat, s]) => ({ cat, ...s, pct: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  const focusRows = catRows.filter(row => row.total > 0).slice(0, 4);
  const wrongOnes = results.filter(r => !r.correct);

  const band = {
    maxWidth: 1080,
    margin: "0 auto",
    padding: "0 clamp(20px, 3vw, 40px)",
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(24px, 4vh, 40px)", paddingBottom: "clamp(22px, 3vh, 30px)" }}>
        <h1 style={h1}>{title}</h1>
        <p style={{ ...pageSub, maxWidth: 560 }}>{summaryLine(pct)}</p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(28px, 4vh, 56px)" }}>
        <div style={{ ...band, paddingTop: "clamp(18px, 2.8vh, 34px)" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
            <section style={{
              padding: "clamp(28px, 4vw, 40px)",
              borderRadius: "var(--r-panel)",
              background: "var(--c-surface2)",
              border: "1px solid var(--c-border)",
              textAlign: "center",
            }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 14px",
                borderRadius: "var(--r-pill)",
                background: tone.wash,
                border: `1px solid ${tone.border}`,
                color: tone.ink,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: -0.1,
              }}>
                {tone.label}
              </div>

              <div style={{
                marginTop: 18,
                fontSize: "clamp(64px, 10vw, 88px)",
                fontWeight: 600,
                letterSpacing: "-3.5px",
                lineHeight: 0.92,
                color: "var(--c-accent)",
              }}>
                {pct}%
              </div>

              <p style={{
                marginTop: 14,
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: -0.25,
                color: C.text,
              }}>
                {correct} correct, {wrong} wrong.
              </p>

              <p style={{ ...body, margin: "8px auto 0", maxWidth: "34ch" }}>
                {summaryLine(pct)}
              </p>
            </section>

            {focusRows.length > 0 && (
              <section style={{
                padding: "clamp(22px, 3.2vw, 28px)",
                borderRadius: "var(--r-panel)",
                background: "var(--c-card-solid)",
                border: "1px solid var(--c-border)",
                boxShadow: "var(--c-card-shadow)",
              }}>
                <h2 style={sectionH}>Focus next on these topics</h2>
                <p style={{ ...meta, marginTop: 6 }}>
                  Weakest areas first. Keep the pass short and targeted.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
                  {focusRows.map(({ cat, correct: c, total: t, pct: p }) => {
                    const col = p >= 70 ? C.success : p >= 50 ? C.warning : C.danger;
                    return (
                      <div key={cat}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 12,
                          marginBottom: 8,
                        }}>
                          <span style={{ fontSize: 14.5, color: C.text, lineHeight: 1.4 }}>{cat}</span>
                          <span style={{ ...meta, color: col, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                            {c}/{t}
                          </span>
                        </div>
                        <ProgressBar value={p} colour={col} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {wrongOnes.length > 0 && (
              <section style={{
                padding: "clamp(22px, 3.2vw, 28px)",
                borderRadius: "var(--r-panel)",
                background: "var(--c-card-solid)",
                border: "1px solid var(--c-border)",
                boxShadow: "var(--c-card-shadow)",
              }}>
                <button
                  type="button"
                  onClick={() => setShowWrong(v => !v)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span>
                    <span style={{ ...sectionH, display: "block" }}>Missed questions</span>
                    <span style={{ ...meta, display: "block", marginTop: 4 }}>
                      {wrongOnes.length} to review
                    </span>
                  </span>
                  <span style={{
                    color: C.muted,
                    fontSize: 18,
                    transform: showWrong ? "rotate(180deg)" : "none",
                    transition: "transform 0.18s ease",
                  }}>
                    ▾
                  </span>
                </button>

                {showWrong && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
                    {wrongOnes.map((r) => (
                      <div key={r.id} style={{
                        padding: "15px 16px",
                        borderRadius: "var(--r-card)",
                        background: "var(--c-surface2)",
                        border: "1px solid var(--c-border)",
                      }}>
                        <p style={{ fontSize: 14.5, color: C.text, lineHeight: 1.55 }}>
                          {r.q}
                        </p>
                        <p style={{ marginTop: 10, fontSize: 13.5, color: C.text }}>
                          <strong>Correct:</strong> {r.correctAnswer}
                        </p>
                        {r.yourAnswer && (
                          <p style={{ marginTop: 4, fontSize: 13.5, color: C.sub }}>
                            <strong>Your answer:</strong> {r.yourAnswer}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-press"
                style={{ ...primaryBtn, flex: "1 1 220px" }}
                onClick={onRestart}
              >
                Practice again
              </button>

              {onDrillWrong && wrongOnes.length > 0 && (
                <button
                  type="button"
                  className="btn-press"
                  onClick={() => onDrillWrong(wrongOnes.map(r => r.id))}
                  style={{ ...fieldBtn, flex: "1 1 220px" }}
                >
                  Redo missed questions
                </button>
              )}

              {onChangeSettings && (
                <button
                  type="button"
                  className="btn-press"
                  onClick={onChangeSettings}
                  style={{ ...btnGhost, flex: "1 1 180px" }}
                >
                  Change settings
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
