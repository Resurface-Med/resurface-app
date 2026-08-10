import { useMemo, useState, useEffect, useRef } from "react";
import { C, V, pageWrap, h1, cardSolid } from "../ui/theme";
import { QUESTIONS } from "../data";
import { goalStore } from "../lib/storage";
import { isDue } from "../lib/sm2";
import GhostBtn from "../ui/GhostBtn";
import DailyQuestion from "../ui/DailyQuestion";

const WEEKS = 26;
const DAY_COL_W = 18; // day-label column width + margin — must stay in sync with JSX

// Build N weeks ending at (today + weekOffset*7 days from now)
function buildGrid(weekOffset = 0) {
  const cells = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOffset = today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() - startOffset - (WEEKS - 1) * 7 + weekOffset * 7);

  for (let w = 0; w < WEEKS; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      week.push(date);
    }
    cells.push(week);
  }
  return cells;
}

function heatColor(count, max = 1) {
  if (!count) return "var(--c-accent-glow)";
  // sqrt scale gives better visual spread across the actual range.
  // Alpha varies per cell, so this is one of the few places a raw colour is
  // unavoidable — it tracks --c-accent (#3562f5) and must move with it.
  const pct = Math.sqrt(Math.min(count / max, 1));
  const opacity = 0.18 + pct * 0.82;
  return `rgba(53,98,245,${opacity.toFixed(2)})`;
}

/** Frosted tile floating on the blue field — the landing's glass card. */
const glassTile = {
  background: "rgba(255,255,255,0.14)",
  border: "1.5px solid rgba(255,255,255,0.32)",
  borderRadius: "var(--r-card)",
  padding: "16px 18px",
  boxShadow: "0 12px 28px rgba(15,27,61,0.15)",
  backdropFilter: "blur(14px) saturate(160%)",
  WebkitBackdropFilter: "blur(14px) saturate(160%)",
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function useCountUp(target, duration = 900, delay = 0) {
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

export default function Dashboard({ pStats, srCards = {}, streak, dueCount, setView, activity = {}, onAnswer, onClearP, onClearSR }) {
  const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
  const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
  const acc = totalT > 0 ? Math.round(totalC / totalT * 100) : null;
  const accCol = acc === null ? C.muted : acc >= 70 ? C.success : acc >= 50 ? C.warning : C.danger;

  const animAcc  = useCountUp(acc, 1000, 500);
  const animSeen = useCountUp(Object.keys(pStats).length, 900, 600);

  const [weekOffset, setWeekOffset] = useState(0);
  const [goalTarget, setGoalTarget] = useState(() => goalStore.get());
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [tooltip, setTooltip] = useState(null); // { x, y, date, count }
  const heatmapRef = useRef(null);

  const grid = useMemo(() => buildGrid(weekOffset), [weekOffset]);

  // Month labels: find first week of each new month in current window
  const monthLabels = useMemo(() => {
    const labels = [];
    grid.forEach((week, wi) => {
      const first = week[0];
      if (wi === 0 || first.getDate() <= 7) {
        labels.push({ wi, label: MONTH_ABBR[first.getMonth()] });
      }
    });
    // Deduplicate consecutive same months
    return labels.filter((l, i) => i === 0 || l.label !== labels[i - 1].label);
  }, [grid]);

  const maxActivity = useMemo(() => {
    const vals = grid.flat().map(date => {
      const k = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      return activity[k] || 0;
    });
    return Math.max(1, ...vals);
  }, [grid, activity]);

  const todayCount = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return activity[key] || 0;
  }, [activity]);

  const totalThisWeek = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    let sum = 0;
    Object.entries(activity).forEach(([dateStr, count]) => {
      // Parse YYYY-MM-DD as local date (not UTC)
      const [y, m, d] = dateStr.split('-').map(Number);
      if (new Date(y, m - 1, d) >= weekStart) sum += count;
    });
    return sum;
  }, [activity]);

  // Numbered like the landing's "How it works" steps — the order is the
  // suggested route through the app, not three equivalent buttons.
  const modes = [
    { k: V.PRACTICE, n: "1", label: "Practice",      body: "Work a topic at your own pace." },
    { k: V.SR,       n: "2", label: "Flashcards",    body: dueCount > 0 ? `${dueCount} due for review right now.` : "Nothing due — you're on top of it.", badge: dueCount > 0 ? dueCount : null },
    { k: V.WRONG,    n: "3", label: "Wrong answers", body: "Go back to what caught you out." },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={pageWrap}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ animation: "dash-left 0.55s cubic-bezier(0.22,1,0.36,1) both" }}>
          <h1 style={h1}>{greeting}.</h1>
          <p style={{ color: "var(--c-on-field-soft)", marginTop: 5, fontSize: 15, fontWeight: 500, letterSpacing: -0.2 }}>
            {totalT === 0 ? "Start practising to track your progress." : `${totalT} questions answered · ${acc ?? 0}% accuracy`}
          </p>
        </div>
        {streak.streak > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            background: "rgba(255,255,255,0.16)", borderRadius: "var(--r-pill)",
            padding: "6px 14px 6px 10px",
            border: "1px solid rgba(255,255,255,0.28)",
            boxShadow: "0 10px 24px rgba(15,27,61,0.15)",
            animation: "spring-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.15s both",
          }}>
            <span style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: -0.3 }}>{streak.streak}</span>
            <span style={{ fontSize: 13, color: "var(--c-on-field-soft)" }}>day streak</span>
          </div>
        )}
      </div>

      {/* The white sheet: one real question, answerable here. */}
      {onAnswer && (
        <DailyQuestion
          questions={QUESTIONS}
          srCards={srCards}
          pStats={pStats}
          isDue={isDue}
          onAnswer={onAnswer}
          onOpenPractice={() => setView(V.PRACTICE)}
        />
      )}

      {/* Glass tiles on the field */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        animation: "rise-blur 0.55s cubic-bezier(0.22,1,0.36,1) 0.25s both",
      }}>
        {[
          { label: "Due now", value: String(dueCount), foot: dueCount > 0 ? "ready to review" : "all caught up" },
          { label: "Accuracy", value: acc === null ? "—" : `${animAcc}%`, foot: `${totalC}/${totalT} correct`, tint: accCol },
          { label: "Seen", value: String(animSeen), foot: `of ${QUESTIONS.length} questions` },
          { label: "Today", value: String(todayCount), foot: null, goal: true },
        ].map(tile => (
          <div key={tile.label} style={glassTile}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-on-field-soft)", letterSpacing: 0.3, textTransform: "uppercase" }}>
              {tile.label}
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#fff", letterSpacing: -1.2, lineHeight: 1.15, marginTop: 6 }}>
              {tile.value}
            </div>

            {tile.goal ? (
              <>
                <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.22)", marginTop: 10, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(todayCount / goalTarget, 1) * 100}%`,
                    background: "#fff",
                    borderRadius: 99,
                    transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)",
                  }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--c-on-field-soft)", marginTop: 7, display: "flex", alignItems: "center", gap: 5 }}>
                  {editingGoal ? (
                    <form onSubmit={e => {
                      e.preventDefault();
                      const n = parseInt(goalDraft);
                      if (n > 0) { goalStore.set(n); setGoalTarget(n); }
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
              <div style={{ fontSize: 12, color: "var(--c-on-field-soft)", marginTop: 7 }}>
                {tile.foot}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div style={{ ...cardSolid, padding: "20px 22px", animation: "sweep-reveal 0.75s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Activity</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: C.muted }}>{totalThisWeek} this week</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setWeekOffset(o => o - 4)} className="btn-press" style={{
                background: C.surface2, border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)",
                color: C.muted, fontSize: 13, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit",
              }}>‹</button>
              {weekOffset < 0 && (
                <button onClick={() => setWeekOffset(0)} className="btn-press" style={{
                  background: C.accentDim, border: "1px solid var(--c-accent-brd)", borderRadius: "var(--r-pill)",
                  color: C.accent, fontSize: 12, fontWeight: 600, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit",
                }}>Today</button>
              )}
              <button onClick={() => setWeekOffset(o => Math.min(0, o + 4))} className="btn-press"
                disabled={weekOffset >= 0}
                style={{
                  background: C.surface2, border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)",
                  color: weekOffset >= 0 ? C.mutedDim : C.muted, fontSize: 13, padding: "4px 10px",
                  cursor: weekOffset >= 0 ? "default" : "pointer", fontFamily: "inherit", opacity: weekOffset >= 0 ? 0.3 : 1,
                }}>›</button>
            </div>
          </div>
        </div>

        {/* Month labels — spacer matches day-label column exactly */}
        <div style={{ display: "flex", marginBottom: 4 }}>
          <div style={{ width: DAY_COL_W, flexShrink: 0 }} />
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            {grid.map((_, wi) => {
              const ml = monthLabels.find(m => m.wi === wi);
              return (
                <div key={wi} style={{ flex: 1, fontSize: 11, color: C.mutedDim, minWidth: 0, overflow: "hidden" }}>
                  {ml ? ml.label : ""}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 0 }} ref={heatmapRef}>
          {/* Day-of-week labels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginRight: 6, flexShrink: 0, width: 12 }}>
            {DAY_LABELS.map((d, i) => (
              <div key={i} style={{ fontSize: 11, color: C.mutedDim, lineHeight: "14px", height: 14 }}>
                {i % 2 === 1 ? d : ""}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            {grid.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                {week.map((date, di) => {
                  const localKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                  const count = activity[localKey] || 0;
                  const now = new Date();
                  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
                  const isToday = localKey === todayKey;
                  const isFuture = date > now;
                  return (
                    <div
                      key={di}
                      onMouseEnter={e => {
                        if (isFuture) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ x: rect.left + rect.width / 2, y: rect.top, date, count, localKey });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        flex: 1, aspectRatio: "1/1", borderRadius: 5,
                        background: isFuture ? "transparent" : heatColor(count, maxActivity),
                        border: isToday ? `1.5px solid ${C.accent}` : "1.5px solid transparent",
                        transition: "background 0.2s",
                        minHeight: 8,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11, color: C.mutedDim }}>Less</span>
          {[0, 0.2, 0.4, 0.7, 1].map(pct => (
            <div key={pct} style={{ width: 12, height: 12, borderRadius: 4, background: heatColor(pct * maxActivity, maxActivity) }} />
          ))}
          <span style={{ fontSize: 11, color: C.mutedDim }}>More</span>
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x, top: tooltip.y - 8,
          transform: "translate(-50%, -100%)",
          background: "var(--c-card-bg)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--r-card)", padding: "8px 12px",
          boxShadow: "var(--c-card-shadow)",
          pointerEvents: "none", zIndex: 999,
          fontSize: 13, whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, color: C.text, marginBottom: 2, letterSpacing: -0.3 }}>
            {tooltip.count > 0 ? `${tooltip.count} question${tooltip.count !== 1 ? "s" : ""}` : "No activity"}
          </div>
          <div style={{ color: C.muted }}>
            {tooltip.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      )}

      {/* Stats link */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setView(V.STATS)} className="btn-press" style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 13, color: "var(--c-on-field-soft)", display: "flex", alignItems: "center", gap: 4,
          padding: "2px 0",
          transition: "color 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.color = "#fff"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--c-on-field-soft)"}
        >
          View detailed stats →
        </button>
      </div>

      {/* Where to go next — the landing's numbered steps, as buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {modes.map((m, i) => (
          <button key={m.k} onClick={() => setView(m.k)} className="hover-lift btn-press" style={{
            ...cardSolid,
            position: "relative",
            padding: "20px 20px 18px",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
            border: "none",
            animation: `rise-blur 0.55s cubic-bezier(0.22,1,0.36,1) ${0.7 + i * 0.07}s both`,
          }}>
            <div style={{
              fontSize: 40, fontWeight: 700, color: C.accent, opacity: 0.22,
              letterSpacing: -2, lineHeight: 1, marginBottom: 10,
            }}>{m.n}</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: -0.4 }}>{m.label}</span>
              {m.badge && (
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: "#fff", background: C.success,
                  borderRadius: "var(--r-pill)", padding: "2px 9px", lineHeight: 1.5,
                }}>{m.badge}</span>
              )}
            </div>

            <p style={{ marginTop: 5, fontSize: 13.5, color: C.sub, lineHeight: 1.45 }}>{m.body}</p>
          </button>
        ))}
      </div>

      {/* Reset links */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", animation: "rise-blur 0.4s ease 1s both" }}>
        <GhostBtn onClick={() => { if (window.confirm("Reset practice stats?")) onClearP(); }}>Reset Practice</GhostBtn>
        <GhostBtn onClick={() => { if (window.confirm("Reset flashcard schedules?")) onClearSR(); }}>Reset Flashcards</GhostBtn>
      </div>

    </div>
  );
}
