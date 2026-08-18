import { useMemo, useState } from "react";
import { C, V, h1, sectionH, eyebrowField, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import ActivityHeatmap from "../ui/ActivityHeatmap";
import { QUESTIONS } from "../data";

/**
 * The home screen: one question on the left, one on the right.
 *
 * Left is "what do I do now" and carries exactly one primary action. Right is
 * "am I keeping up" and is deliberately quiet — it is reference, not a call to
 * act. The previous version asked "how am I doing" four different ways in four
 * identically-weighted tiles above the fold, and answered "what do I do now"
 * last, which is backwards for an app you open in order to study.
 *
 * The blue field stays, but it now carries only the greeting and the streak.
 * Its job is to say whose app this is; the numbers moved down onto the sheet
 * where white space can separate them.
 */

export default function Dashboard({
  pStats, streak, dueCount, newCount = 0, setView,
  activity = {}, dailyGoal = 20, onGoalChange, onStudy,
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  // The single most useful thing to do right now. Reviews come first because a
  // lapsed interval is the one thing in spaced repetition that actually decays;
  // new material is what you do once nothing is owed.
  const primary =
    dueCount > 0
      ? {
          scope: "due",
          value: dueCount,
          unit: dueCount === 1 ? "question" : "questions",
          title: "due for review",
          body: "These are the ones your memory is about to let go of.",
          cta: "Start review",
        }
      : newCount > 0
        ? {
            scope: "all",
            value: newCount,
            unit: newCount === 1 ? "question" : "questions",
            title: seen === 0 ? "waiting for you" : "you haven't seen yet",
            body: seen === 0
              ? "Nothing is scheduled yet — answer a few and Resurface starts planning your reviews."
              : "Nothing is due, so this is a good moment for new material.",
            cta: seen === 0 ? "Start studying" : "Learn something new",
          }
        : {
            scope: "all",
            value: null,
            title: "You're all caught up",
            body: "Nothing due and nothing new. Practise anything you like.",
            cta: "Practise anything",
          };

  const secondary = [
    { scope: "all",   label: "Practice anything",   body: "Any topic, at your own pace." },
    { scope: "wrong", label: "Fix what you missed", body: "The ones that caught you out." },
  ];

  const band = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "0 clamp(20px, 3vw, 40px)",
    width: "100%",
  };

  const goalPct = Math.min(todayCount / dailyGoal, 1) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      {/* ── Blue field: whose app this is ──────────────────────────── */}
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 38px)", paddingBottom: "clamp(20px, 3vh, 32px)" }}>
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
            <div style={{
              display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0,
              animation: "rise-blur 0.28s cubic-bezier(0.22,1,0.36,1) 0.06s both",
            }}>
              <span style={{ fontSize: "clamp(28px, 2.8vw, 36px)", fontWeight: 700, color: OF.text, letterSpacing: -1.5, lineHeight: 1 }}>
                {streak.streak}
              </span>
              <span style={{ fontSize: 14, color: OF.soft, fontWeight: 500 }}>
                day{streak.streak === 1 ? "" : "s"} in a row
              </span>
            </div>
          )}
        </header>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      {/* ── White sheet: act on the left, track on the right ───────── */}
      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(28px, 4vh, 52px)" }}>
        <div style={{ ...band, paddingTop: "clamp(14px, 2.4vh, 26px)" }}>
          <div className="dash-split">

            {/* Act */}
            <div style={{ animation: "rise-blur 0.3s cubic-bezier(0.22,1,0.36,1) 0.1s both" }}>
              <button
                onClick={() => onStudy?.(primary.scope)}
                className="hover-lift btn-press"
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  fontFamily: "inherit", border: "none",
                  borderRadius: "var(--r-card)",
                  padding: "clamp(22px, 2.6vw, 30px)",
                  background: "var(--c-accent)",
                  boxShadow: "var(--c-cta-shadow)",
                  color: "#fff",
                }}
              >
                {primary.value !== null ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "clamp(40px, 4.4vw, 56px)", fontWeight: 700, letterSpacing: -2.4, lineHeight: 1 }}>
                      {primary.value}
                    </span>
                    <span style={{ fontSize: 17, fontWeight: 600, opacity: 0.92 }}>
                      {primary.unit} {primary.title}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: "clamp(24px, 2.4vw, 30px)", fontWeight: 700, letterSpacing: -1.1, lineHeight: 1.15 }}>
                    {primary.title}
                  </div>
                )}

                <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.5, opacity: 0.86, maxWidth: "38ch" }}>
                  {primary.body}
                </p>

                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 7, marginTop: 20,
                  background: "#fff", color: "var(--c-accent)",
                  borderRadius: "var(--r-pill)", padding: "11px 22px",
                  fontSize: 15, fontWeight: 600,
                }}>
                  {primary.cta} <span aria-hidden="true">→</span>
                </span>
              </button>

              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {secondary.map((s, i) => (
                  <button
                    key={s.scope}
                    onClick={() => onStudy?.(s.scope)}
                    className="btn-press"
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      width: "100%", textAlign: "left", cursor: "pointer",
                      fontFamily: "inherit",
                      background: "transparent",
                      border: "1px solid var(--c-border)",
                      borderRadius: "var(--r-card)",
                      padding: "14px 18px",
                      animation: `rise-blur 0.26s cubic-bezier(0.22,1,0.36,1) ${0.18 + i * 0.05}s both`,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, color: C.text, letterSpacing: -0.2 }}>
                        {s.label}
                      </span>
                      <span style={{ display: "block", fontSize: 13.5, color: C.sub, marginTop: 2 }}>
                        {s.body}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: C.accent, fontSize: 16, flexShrink: 0 }}>→</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Track — reference, not a call to act, so nothing here shouts */}
            <div style={{ animation: "rise-blur 0.3s cubic-bezier(0.22,1,0.36,1) 0.2s both" }}>
              <div style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                gap: 12, flexWrap: "wrap",
              }}>
                <h2 style={sectionH}>Today</h2>
                <span style={{ fontSize: 14, color: C.sub }}>
                  {todayCount} of{" "}
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
                          width: 52, background: "var(--c-surface3)", border: "1px solid var(--c-border)",
                          borderRadius: 6, outline: "none", fontSize: 14, color: C.text,
                          fontFamily: "inherit", textAlign: "center", padding: "1px 0",
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => { setGoalDraft(String(dailyGoal)); setEditingGoal(true); }}
                      style={{
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: C.accent,
                      }}
                    >{dailyGoal}</button>
                  )}
                  {todayCount >= dailyGoal ? " ✓" : ""}
                </span>
              </div>

              <div style={{ height: 6, borderRadius: 99, background: "var(--c-surface3)", marginTop: 10, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${goalPct}%`,
                  background: "var(--c-accent)", borderRadius: 99,
                  transition: "width 0.35s cubic-bezier(0.22,1,0.36,1)",
                }} />
              </div>

              <div style={{ marginTop: 26 }}>
                <ActivityHeatmap activity={activity} />
              </div>

              {/* The three numbers that used to be tiles, as one line of prose */}
              <div style={{
                display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
                marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--c-border)",
                fontSize: 14, color: C.sub,
              }}>
                <span>{seen} of {QUESTIONS.length} seen</span>
                {acc !== null && <><span aria-hidden="true">·</span><span>{acc}% accuracy</span></>}
                <button
                  onClick={() => setView(V.PROGRESS)}
                  className="btn-press"
                  style={{
                    marginLeft: "auto", background: "none", border: "none", padding: 0,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                    fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  Progress <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
