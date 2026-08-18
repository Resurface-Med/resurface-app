import { useMemo, useState, useEffect } from "react";
import { C, V, h1, card, sectionH, eyebrowField, eyebrow, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import ActivityHeatmap from "../ui/ActivityHeatmap";
import { QUESTIONS } from "../data";
import GhostBtn from "../ui/GhostBtn";

// The landing's frosted cards have no rim — the blurred backdrop is the effect,
// not a fill and a border. 0.10 is measured off the same comp.
const glassTile = {
  background: "rgba(255,255,255,0.10)",
  border: "none",
  borderRadius: "var(--r-card)",
  padding: "clamp(16px, 2vw, 22px)",
  backdropFilter: "blur(16px) saturate(160%)",
  WebkitBackdropFilter: "blur(16px) saturate(160%)",
};

function useCountUp(target, duration = 420, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === null || target === 0) { setVal(target ?? 0); return; }
    const start = performance.now() + delay;
    let raf;
    function tick(now) {
      const elapsed = Math.max(0, now - start);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setVal(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);
  return val;
}

export default function Dashboard({ pStats, streak, dueCount, setView, activity = {}, dailyGoal = 20, onGoalChange, onStudy, onClearP, onClearSR }) {
  const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
  const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
  const acc = totalT > 0 ? Math.round(totalC / totalT * 100) : null;

  const animAcc  = useCountUp(acc, 450, 120);
  const animSeen = useCountUp(Object.keys(pStats).length, 420, 160);

  const goalTarget = dailyGoal;
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const todayCount = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return activity[key] || 0;
  }, [activity]);

  // Numbered like the landing's "How it works" steps — the order is the
  // suggested route through the app, not three equivalent buttons.
  const modes = [
    { scope: "due",   n: "1", label: "Review what's due", body: dueCount > 0 ? `${dueCount} question${dueCount === 1 ? "" : "s"} ready to resurface.` : "Nothing due — you're on top of it.", badge: dueCount > 0 ? dueCount : null },
    { scope: "all",   n: "2", label: "Practice anything", body: "Work through a topic at your own pace." },
    { scope: "wrong", n: "3", label: "Fix what you missed", body: "Go back to the ones that caught you out." },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const band = {
    maxWidth: 1080,
    margin: "0 auto",
    padding: "0 clamp(20px, 3vw, 40px)",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "clamp(18px, 2.6vh, 28px)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      {/* ── Blue band: who you are and how you're doing ────────────── */}
      <div style={{ ...band, paddingTop: "clamp(26px, 4.5vh, 46px)", paddingBottom: "clamp(24px, 4vh, 40px)" }}>

      {/* Header — eyebrow, headline, supporting line: the landing's section
          opening, applied to a page rather than a marketing band. */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        gap: 20, flexWrap: "wrap",
        animation: "dash-left 0.26s cubic-bezier(0.22,1,0.36,1) both",
      }}>
        <div>
          <span style={eyebrowField}>{todayLabel}</span>
          <h1 style={{ ...h1, marginTop: 14 }}>{greeting}.</h1>
          <p style={{ color: OF.soft, marginTop: 8, fontSize: 16, fontWeight: 400, letterSpacing: -0.2, lineHeight: 1.5 }}>
            {totalT === 0
              ? "Start practising and your progress shows up here."
              : `${totalT} questions answered · ${acc ?? 0}% accuracy`}
          </p>
        </div>

        {streak.streak > 0 && (
          <div style={{
            display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0,
            animation: "rise-blur 0.28s cubic-bezier(0.22,1,0.36,1) 0.06s both",
          }}>
            <span style={{ fontSize: "clamp(30px, 3vw, 38px)", fontWeight: 700, color: OF.text, letterSpacing: -1.6, lineHeight: 1 }}>
              {streak.streak}
            </span>
            <span style={{ fontSize: 14, color: OF.soft, fontWeight: 500 }}>
              day{streak.streak === 1 ? "" : "s"} in a row
            </span>
          </div>
        )}
      </header>

      {/* Glass tiles on the field */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
        gap: 12,
        animation: "rise-blur 0.28s cubic-bezier(0.22,1,0.36,1) 0.25s both",
      }}>
        {[
          { label: "Due now", value: String(dueCount), foot: dueCount > 0 ? "ready to review" : "all caught up" },
          { label: "Accuracy", value: acc === null ? "—" : `${animAcc}%`, foot: `${totalC}/${totalT} correct` },
          { label: "Seen", value: String(animSeen), foot: `of ${QUESTIONS.length} questions` },
          { label: "Today", value: String(todayCount), foot: null, goal: true },
        ].map(tile => (
          <div key={tile.label} style={glassTile}>
            <div style={{ fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 700, color: OF.text, letterSpacing: -1.5, lineHeight: 1.05 }}>
              {tile.value}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: OF.soft, marginTop: 8, letterSpacing: -0.1 }}>
              {tile.label}
            </div>

            {tile.goal ? (
              <>
                <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.22)", marginTop: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(todayCount / goalTarget, 1) * 100}%`,
                    background: "#fff",
                    borderRadius: 99,
                    transition: "width 0.35s cubic-bezier(0.22,1,0.36,1)",
                  }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--c-on-field-soft)", marginTop: 7, display: "flex", alignItems: "center", gap: 5 }}>
                  {editingGoal ? (
                    <form onSubmit={e => {
                      e.preventDefault();
                      const n = parseInt(goalDraft);
                      if (n > 0) onGoalChange?.(n);
                      setEditingGoal(false);
                    }}>
                      <input autoFocus type="number" min="1" max="500"
                        value={goalDraft} onChange={e => setGoalDraft(e.target.value)}
                        onBlur={() => setEditingGoal(false)}
                        style={{
                          width: 54, background: "rgba(255,255,255,0.16)", border: "none",
                          borderRadius: 6, outline: "none", fontSize: 12, color: "#fff",
                          fontFamily: "inherit", textAlign: "center", padding: "2px 0",
                        }}
                      />
                    </form>
                  ) : (
                    <>
                      {todayCount >= goalTarget ? "✓ " : ""}goal {goalTarget}
                      <button onClick={() => { setGoalDraft(String(goalTarget)); setEditingGoal(true); }}
                        aria-label="Edit daily goal"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-on-field-soft)", fontSize: 11, padding: 0 }}
                      >✎</button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: OF.faint, marginTop: 4 }}>
                {tile.foot}
              </div>
            )}
          </div>
        ))}
      </div>

      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      {/* ── White sheet: the working surface ───────────────────────── */}
      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(40px, 6vh, 72px)" }}>
        <div style={{ ...band, paddingTop: "clamp(8px, 2vh, 20px)" }}>

      <div style={{ animation: "sweep-reveal 0.34s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s both" }}>
        <ActivityHeatmap activity={activity} />
      </div>

      {/* Where to go next — the landing's numbered steps, as buttons */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 16, flexWrap: "wrap", marginTop: 8,
      }}>
        <div>
          <span style={eyebrow}>Keep going</span>
          <h2 style={{ ...sectionH, fontSize: "clamp(22px, 2.2vw, 30px)", letterSpacing: -0.9, marginTop: 12 }}>
            Where to next?
          </h2>
        </div>
        <button onClick={() => setView(V.PROGRESS)} className="btn-press" style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 14.5, fontWeight: 600, color: C.accent,
          display: "flex", alignItems: "center", gap: 5, padding: 0,
        }}>
          See your progress <span aria-hidden="true">→</span>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {modes.map((m, i) => (
          <button key={m.scope} onClick={() => onStudy?.(m.scope)} className="hover-lift btn-press" style={{
            ...card,
            position: "relative",
            padding: "clamp(20px, 2.4vw, 26px)",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
            border: "none",
            animation: `rise-blur 0.28s cubic-bezier(0.22,1,0.36,1) ${0.16 + i * 0.035}s both`,
          }}>
            <div style={{
              fontSize: "clamp(38px, 4vw, 52px)", fontWeight: 700, color: C.accent, opacity: 0.2,
              letterSpacing: -2.2, lineHeight: 1, marginBottom: 14,
            }}>{m.n}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...sectionH, fontSize: 17 }}>{m.label}</span>
              {m.badge && (
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: "#fff", background: C.success,
                  borderRadius: "var(--r-pill)", padding: "2px 9px", lineHeight: 1.5,
                }}>{m.badge}</span>
              )}
            </div>

            <p style={{ marginTop: 7, fontSize: 14.5, color: C.sub, lineHeight: 1.5, letterSpacing: -0.1 }}>{m.body}</p>
          </button>
        ))}
      </div>

      {/* Reset links */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, animation: "rise-blur 0.22s ease 0.4s both" }}>
            <GhostBtn onClick={() => { if (window.confirm("Reset practice stats?")) onClearP(); }}>Reset practice stats</GhostBtn>
            <GhostBtn onClick={() => { if (window.confirm("Reset review schedules?")) onClearSR(); }}>Reset review schedule</GhostBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
