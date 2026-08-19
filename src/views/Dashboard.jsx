import { useMemo, useState } from "react";
import { C, V, h1, sectionH, eyebrowField, meta, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import ActivityHeatmap from "../ui/ActivityHeatmap";
import { QUESTIONS } from "../data";

/**
 * The home screen.
 *
 * Two panes of comparable weight below the wave: where you stand in the bank,
 * and what you have been doing. Topic-level detail lives on Progress — this
 * page answers "how far am I and am I keeping at it", and hands off anything
 * that needs reading rather than glancing.
 *
 * Every number sits inside the block it describes. The version that kept a
 * strip of figures across the foot of the page had them belonging to nothing,
 * which is both the reason it looked wrong and the reason nobody read it.
 */

/** Anki's threshold for a mature card, in days. */
const MASTERED_DAYS = 21;

function StatRow({ label, value, strong = false, top = false, i = 0 }) {
  return (
    <div data-in="rise" style={{
      "--i": i,
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 12, padding: "9px 0",
      borderTop: top ? "1px solid var(--c-border)" : "none",
      marginTop: top ? 8 : 0,
      paddingTop: top ? 15 : 9,
    }}>
      <span style={{ fontSize: 14, color: C.sub }}>{label}</span>
      <span style={{
        fontSize: strong ? 17 : 15,
        fontWeight: strong ? 700 : 600,
        color: C.text,
        letterSpacing: -0.3,
        fontVariantNumeric: "tabular-nums",
      }}>{value}</span>
    </div>
  );
}

export default function Dashboard({
  pStats, streak, dueCount, setView,
  activity = {}, srCards = {}, dailyGoal = 20, onGoalChange, onStudy,
}) {
  const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
  const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
  const acc = totalT > 0 ? Math.round(totalC / totalT * 100) : null;
  const seen = Object.keys(pStats).length;
  const total = QUESTIONS.length;

  const mastered = useMemo(
    () => Object.values(srCards).filter(c => (c?.interval ?? 0) >= MASTERED_DAYS).length,
    [srCards],
  );

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const todayCount = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return activity[key] || 0;
  }, [activity]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  // Two actions, max: reviews that are due, and open practice. Wrong-answer
  // drilling lives inside Practice as a scope — it does not need a third door.
  const actions = dueCount > 0
    ? [
        { scope: "due", label: `Review ${dueCount} due`, primary: true },
        { scope: "all", label: "Practice", primary: false },
      ]
    : [
        { scope: "all", label: seen === 0 ? "Start studying" : "Practice", primary: true },
      ];

  const band = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "0 clamp(20px, 3vw, 40px)",
    width: "100%",
  };

  const pctMastered = (mastered / total) * 100;
  const pctSeenOnly = (Math.max(seen - mastered, 0) / total) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      {/* ── Blue field: who you are, and the one thing to do ───────── */}
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(20px, 3vh, 30px)" }}>
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          gap: 20, flexWrap: "wrap",
        }}>
          <div data-in="left" style={{ "--i": 0 }}>
            <span style={eyebrowField}>{todayLabel}</span>
            <h1 style={{ ...h1, marginTop: 10 }}>{greeting}.</h1>
          </div>

          {streak.streak > 0 && (
            <div data-in="right" style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0, "--i": 1 }}>
              <span style={{ fontSize: "clamp(26px, 2.6vw, 32px)", fontWeight: 700, color: OF.text, letterSpacing: -1.4, lineHeight: 1 }}>
                {streak.streak}
              </span>
              <span style={{ fontSize: 14, color: OF.soft, fontWeight: 500 }}>
                day{streak.streak === 1 ? "" : "s"} in a row
              </span>
              {streak.longest > streak.streak && (
                <span style={{ fontSize: 13, color: OF.faint, fontWeight: 500 }}>
                  best {streak.longest}
                </span>
              )}
            </div>
          )}
        </header>

        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          marginTop: "clamp(16px, 2.4vh, 24px)",
        }}>
          {actions.map((a, i) => (
            <button
              key={a.scope}
              onClick={() => onStudy?.(a.scope)}
              className="btn-press"
              data-in="pop"
              style={{ "--i": 2 + i, ...(a.primary ? {
                background: "var(--c-field-object)", color: "var(--c-field-object-ink)", border: "none",
                borderRadius: "var(--r-pill)", padding: "11px 22px",
                fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(15,27,61,0.1)",
                display: "flex", alignItems: "center", gap: 7,
              } : {
                background: "rgba(255,255,255,0.12)", color: OF.text,
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: "var(--r-pill)", padding: "11px 20px",
                fontFamily: "inherit", fontSize: 15, fontWeight: 500, cursor: "pointer",
              }) }}
            >
              {a.label}{a.primary ? <span aria-hidden="true">→</span> : null}
            </button>
          ))}
        </div>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      {/* ── Sheet: where you stand, and what you've been doing ─────── */}
      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(24px, 4vh, 48px)" }}>
        <div style={{ ...band, paddingTop: "clamp(16px, 2.6vh, 28px)" }}>
          <div className="dash-split">

            <section data-in="rise" style={{ "--i": 5 }}>
              <h2 style={sectionH}>Your progress</h2>
              <p style={{ ...meta, marginTop: 4 }}>
                {seen === 0
                  ? `All ${total} questions are waiting.`
                  : `${Math.round((seen / total) * 100)}% of the bank attempted.`}
              </p>

              {/* One object, three quantities. Mastered nests inside seen nests
                  inside the bank, which separate figures could only imply. */}
              <div data-in="grow" style={{
                display: "flex", height: 16, borderRadius: 99, overflow: "hidden",
                background: "var(--c-surface3)", marginTop: 20, "--i": 6,
              }}>
                {/* flex-basis rather than width so the two segments still
                    share the track, and no transition — the parent already
                    sweeps open on scaleX, and animating these would re-run
                    layout inside something that is mid-animation. */}
                <div style={{ flex: `0 0 ${pctMastered}%`, background: "var(--c-accent)" }} />
                <div style={{ flex: `0 0 ${pctSeenOnly}%`, background: "var(--c-accent)", opacity: 0.32 }} />
              </div>

              <div style={{ marginTop: 16 }}>
                <StatRow
                  i={7}
                  strong
                  label={<><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "var(--c-accent)", marginRight: 8 }} />Mastered</>}
                  value={mastered.toLocaleString()}
                />
                <StatRow
                  i={8}
                  label={<><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "var(--c-accent)", opacity: 0.32, marginRight: 8 }} />Seen</>}
                  value={seen.toLocaleString()}
                />
                <StatRow
                  i={9}
                  label={<><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "var(--c-surface3)", marginRight: 8 }} />Not yet started</>}
                  value={(total - seen).toLocaleString()}
                />

                <StatRow i={10} top label="Questions answered" value={totalT.toLocaleString()} />
                <StatRow i={11} label="Accuracy" value={acc === null ? "—" : `${acc}%`} />
              </div>

              <button
                onClick={() => setView(V.PROGRESS)}
                className="btn-press"
                style={{
                  marginTop: 14, background: "none", border: "none", padding: 0,
                  cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                  fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 5,
                }}
              >
                Full breakdown by topic <span aria-hidden="true">→</span>
              </button>
            </section>

            <section data-in="rise" style={{ "--i": 7 }}>
              <ActivityHeatmap activity={activity} />

              <div style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                marginTop: 20, paddingTop: 15, borderTop: "1px solid var(--c-border)",
                fontSize: 13.5, color: C.sub,
              }}>
                <span>
                  Today {todayCount} of{" "}
                  {editingGoal ? (
                    <form
                      style={{ display: "inline" }}
                      onSubmit={e => {
                        e.preventDefault();
                        const n = parseInt(goalDraft);
                        if (n > 0) onGoalChange?.(n);
                        setEditingGoal(false);
                      }}
                    >
                      <input
                        autoFocus type="number" min="1" max="500"
                        value={goalDraft}
                        onChange={e => setGoalDraft(e.target.value)}
                        onBlur={() => setEditingGoal(false)}
                        style={{
                          width: 50, background: "var(--c-surface3)", border: "1px solid var(--c-border)",
                          borderRadius: 6, outline: "none", fontSize: 13.5, color: C.text,
                          fontFamily: "inherit", textAlign: "center", padding: "1px 0",
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => { setGoalDraft(String(dailyGoal)); setEditingGoal(true); }}
                      style={{
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: C.accent,
                      }}
                    >{dailyGoal}</button>
                  )}
                  {todayCount >= dailyGoal ? " ✓" : ""}
                </span>

                {streak.streak > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{streak.streak} day streak</span>
                  </>
                )}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
