import { useMemo, useState } from "react";
import { C, V, h1, sectionH, eyebrowField, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import ActivityHeatmap from "../ui/ActivityHeatmap";
import { QUESTIONS } from "../data";

/**
 * The home screen: three zones, not eight.
 *
 * The previous versions kept growing modules — a hero, a wave, four stat
 * tiles, a big accent card, two outlined cards, a goal bar, a heatmap, a
 * stats line — each individually reasonable and collectively exhausting.
 * The fix is fewer objects, not quieter ones: the blue field carries the
 * greeting *and* the actions (so there is exactly one accent moment on the
 * page), and the sheet below holds the two things a question bank owes you —
 * what's in the bank, and what you've done with it.
 *
 * The subject list is deliberately a list. Nine cards would have been nine
 * competing rectangles; nine rows read as one object.
 */

export default function Dashboard({
  pStats, streak, dueCount, setView,
  activity = {}, dailyGoal = 20, onGoalChange, onStudy, onStudyDeck,
}) {
  const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
  const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
  const acc = totalT > 0 ? Math.round(totalC / totalT * 100) : null;
  const seen = Object.keys(pStats).length;

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const todayCount = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return activity[key] || 0;
  }, [activity]);

  // Coverage per subject, in the manifest's own order.
  const subjects = useMemo(() => {
    const by = new Map();
    for (const q of QUESTIONS) {
      let s = by.get(q.deck);
      if (!s) { s = { deck: q.deck, total: 0, seen: 0 }; by.set(q.deck, s); }
      s.total += 1;
      if (pStats[q.id]) s.seen += 1;
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  }, [pStats]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  // Reviews first — a lapsed interval is the only thing here that actually
  // decays. Everything else is still there tomorrow.
  const primary =
    dueCount > 0
      ? { scope: "due", label: `Review ${dueCount} due` }
      : { scope: "all", label: seen === 0 ? "Start studying" : "Practice anything" };

  const secondary = [
    dueCount > 0 && { scope: "all",   label: "Practice anything" },
    seen > 0     && { scope: "wrong", label: "Fix what you missed" },
  ].filter(Boolean);

  const band = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "0 clamp(20px, 3vw, 40px)",
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      {/* ── Blue field: who you are, and the one thing to do ───────── */}
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(20px, 3vh, 30px)" }}>
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          gap: 20, flexWrap: "wrap",
          animation: "dash-left 0.26s cubic-bezier(0.22,1,0.36,1) both",
        }}>
          <div>
            <span style={eyebrowField}>{todayLabel}</span>
            <h1 style={{ ...h1, marginTop: 10 }}>{greeting}.</h1>
          </div>

          {streak.streak > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: "clamp(26px, 2.6vw, 32px)", fontWeight: 700, color: OF.text, letterSpacing: -1.4, lineHeight: 1 }}>
                {streak.streak}
              </span>
              <span style={{ fontSize: 14, color: OF.soft, fontWeight: 500 }}>
                day{streak.streak === 1 ? "" : "s"} in a row
              </span>
            </div>
          )}
        </header>

        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          marginTop: "clamp(16px, 2.4vh, 24px)",
          animation: "rise-blur 0.28s cubic-bezier(0.22,1,0.36,1) 0.1s both",
        }}>
          <button
            onClick={() => onStudy?.(primary.scope)}
            className="btn-press"
            style={{
              background: "#fff", color: "var(--c-accent)", border: "none",
              borderRadius: "var(--r-pill)", padding: "12px 26px",
              fontFamily: "inherit", fontSize: 15.5, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 8px 20px rgba(15,27,61,0.16)",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            {primary.label} <span aria-hidden="true">→</span>
          </button>

          {secondary.map(s => (
            <button
              key={s.scope}
              onClick={() => onStudy?.(s.scope)}
              className="btn-press"
              style={{
                background: "rgba(255,255,255,0.12)", color: OF.text,
                border: "none", borderRadius: "var(--r-pill)", padding: "12px 20px",
                fontFamily: "inherit", fontSize: 15, fontWeight: 500, cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      {/* ── Sheet: the bank, and what you've done with it ──────────── */}
      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(24px, 4vh, 48px)" }}>
        <div style={{ ...band, paddingTop: "clamp(14px, 2.4vh, 24px)" }}>
          <div className="dash-split">

            <section style={{ animation: "rise-blur 0.3s cubic-bezier(0.22,1,0.36,1) 0.14s both" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <h2 style={sectionH}>Your bank</h2>
                <span style={{ fontSize: 13.5, color: C.mutedDim }}>
                  {seen} of {QUESTIONS.length} seen
                </span>
              </div>

              <div>
                {subjects.map(s => {
                  const pct = s.total > 0 ? (s.seen / s.total) * 100 : 0;
                  return (
                    <button
                      key={s.deck}
                      onClick={() => onStudyDeck?.(s.deck)}
                      className="subject-row"
                      title={`Practise ${s.deck}`}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500, color: C.text, letterSpacing: -0.15, textAlign: "left" }}>
                        {s.deck}
                      </span>

                      <span style={{ width: "clamp(52px, 8vw, 96px)", height: 4, borderRadius: 99, background: "var(--c-surface3)", overflow: "hidden", flexShrink: 0 }}>
                        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--c-accent)", borderRadius: 99 }} />
                      </span>

                      <span style={{ width: 62, textAlign: "right", fontSize: 13, color: C.sub, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {s.seen}/{s.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={{ animation: "rise-blur 0.3s cubic-bezier(0.22,1,0.36,1) 0.22s both" }}>
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

                {acc !== null && <><span aria-hidden="true">·</span><span>{acc}% accuracy</span></>}

                <button
                  onClick={() => setView(V.PROGRESS)}
                  className="btn-press"
                  style={{
                    marginLeft: "auto", background: "none", border: "none", padding: 0,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 13.5,
                    fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  Progress <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
