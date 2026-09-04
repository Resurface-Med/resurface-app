import { useState } from "react";
import { C, h1, pageSub, sectionH, eyebrowField, primaryBtn, btnGhost } from "./theme";
import ProgressBar from "./ProgressBar";
import Wave from "./Wave";

/**
 * The end of a session.
 *
 * The previous version had four surfaces stacked inside each other — blue
 * field, white sheet, a grey panel, then white cards on top of that — for a
 * screen with three things on it. It also printed the same sentence twice,
 * once under the title and again inside the panel, and led with a praise chip
 * that told you nothing the score did not.
 *
 * This is the same shape as Dashboard, Progress and Leaderboard: eyebrow,
 * result, one line, then sections separated by rules rather than by boxes.
 * Nothing is repeated, and nothing is on the page that has no job.
 */

/**
 * A reaction, not an explanation.
 *
 * Every one of these used to end in the spaced-repetition mechanic — that the
 * misses come back sooner and the rest come back spaced further apart. The
 * landing page says that five times over, which is its job; saying it again
 * after every session, forever, tells someone a fact they learned before they
 * signed up.
 *
 * None of them restate the score either. The count is set in 60px directly
 * above this line, so "All correct" underneath it was the same redundancy in
 * miniature.
 *
 * The bottom tier stays plain and gives them something to do. A joke aimed at
 * someone who has just scored 40% reads as mockery, and that is the exact
 * moment they decide whether to close the app.
 */
function verdictLine(correct, total) {
  if (total === 0) return "Nothing answered.";
  if (correct === total) return "Suspiciously good.";
  const pct = correct / total;
  if (pct >= 0.8) return "Close to clean.";
  if (pct >= 0.6) return "Getting there.";
  return "Rough one. Worth another go.";
}

const band = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

export default function SessionSummary({ results, title, onRestart, onChangeSettings, onDrillWrong }) {
  const [showWrong, setShowWrong] = useState(false);

  const total = results.length;
  const correct = results.filter(r => r.correct).length;
  const wrongOnes = results.filter(r => !r.correct);

  const byCat = {};
  for (const r of results) {
    if (!byCat[r.cat]) byCat[r.cat] = { correct: 0, total: 0 };
    byCat[r.cat].total += 1;
    if (r.correct) byCat[r.cat].correct += 1;
  }

  /* Only topics that actually lost marks. The old list included every topic in
     the session, sorted, under the heading "Focus next on these topics" — so a
     clean run was told to focus next on a topic it had just scored full marks
     on, with a full green bar underneath saying so. */
  const shaky = Object.entries(byCat)
    .map(([cat, s]) => ({ cat, ...s, pct: Math.round((s.correct / s.total) * 100) }))
    .filter(row => row.correct < row.total)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(24px, 4vh, 40px)", paddingBottom: "clamp(22px, 3vh, 32px)" }}>
        <span style={eyebrowField} data-in="left">{title}</span>

        {/* The count, not a percentage. A single-question session scoring
            "100%" in 88px type is the sort of thing only a computer thinks is
            impressive, and the fraction carries the sample size with it. */}
        <h1 data-in="left" style={{ ...h1, fontSize: "clamp(38px, 5.6vw, 60px)", letterSpacing: "-2.2px", margin: "12px 0 0", "--i": 1 }}>
          {correct} <span className="sum-of">of</span> {total} <span className="sum-of">correct</span>
        </h1>

        <p data-in="left" style={{ ...pageSub, maxWidth: "44ch", "--i": 2 }}>
          {verdictLine(correct, total)}
        </p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(28px, 4vh, 56px)" }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(18px, 2.8vh, 32px)" }}>

          {shaky.length > 0 && (
            <section className="sum-section" data-in="rise" style={{ "--i": 3 }}>
              <div className="prog-section-head">
                <h2 style={{ ...sectionH, margin: 0 }}>Worth another look</h2>
                <span className="prog-section-note">Fewest right first</span>
              </div>
              <div className="sum-topics">
                {shaky.map(({ cat, correct: c, total: t, pct: p }) => (
                  <div key={cat} className="sum-topic">
                    <div className="sum-topic-line">
                      <span className="sum-topic-name">{cat}</span>
                      <span className="sum-topic-count">{c}/{t}</span>
                    </div>
                    <ProgressBar value={p} colour={p < 50 ? C.danger : p < 80 ? C.warning : C.accent} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {wrongOnes.length > 0 && (
            <section className="sum-section" data-in="rise" style={{ "--i": 4 }}>
              <button
                type="button"
                className="sum-disclose"
                onClick={() => setShowWrong(v => !v)}
                aria-expanded={showWrong}
              >
                <span>
                  <span style={{ ...sectionH, display: "block" }}>Missed questions</span>
                  <span className="prog-section-note">{wrongOnes.length} to review</span>
                </span>
                <span className={`prog-chevron${showWrong ? " is-open" : ""}`} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                    <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {showWrong && (
                <ol className="sum-missed">
                  {wrongOnes.map(r => (
                    <li key={r.id} className="sum-missed-item">
                      <p className="sum-missed-q">{r.q}</p>
                      <p className="sum-missed-row">
                        <span className="sum-missed-lbl is-ok">Answer</span>
                        <span>{r.correctAnswer}</span>
                      </p>
                      {r.yourAnswer && (
                        <p className="sum-missed-row">
                          <span className="sum-missed-lbl is-bad">You put</span>
                          <span>{r.yourAnswer}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {/* Three tiers, sized to their labels. They used to be stretched by
              flex: 1 1 200px, which set their widths from a basis rather than
              from anything meaningful and handed the longest label the
              smallest one — so "Change settings" wrapped onto two lines while
              the others did not, and the row came out ragged. */}
          <div className="sum-actions" data-in="rise" style={{ "--i": 5 }}>
            <button type="button" className="btn-press" style={primaryBtn} onClick={onRestart}>
              Practice again
            </button>

            {onDrillWrong && wrongOnes.length > 0 && (
              <button
                type="button"
                className="btn-press sum-btn-soft"
                onClick={() => onDrillWrong(wrongOnes.map(r => r.id))}
              >
                Redo missed
              </button>
            )}

            {onChangeSettings && (
              <button type="button" className="btn-press" onClick={onChangeSettings} style={btnGhost}>
                Change settings
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
