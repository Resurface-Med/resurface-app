import { useMemo, useState, useEffect, useRef } from "react";
import { C, V, pageWrap, h1, card, primaryBtn } from "../constants";
import { QUESTIONS } from "../data/questions";
import { goalStore } from "../utils/storage";
import GhostBtn from "./shared/GhostBtn";

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
  if (!count) return "rgba(77,142,245,0.06)";
  // sqrt scale gives better visual spread across the actual range
  const pct = Math.sqrt(Math.min(count / max, 1));
  const opacity = 0.18 + pct * 0.82;
  return `rgba(77,142,245,${opacity.toFixed(2)})`;
}

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

export default function Dashboard({ pStats, srCards, streak, dueCount, bmCount, setView, activity = {}, onClearP, onClearSR }) {
  const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
  const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
  const acc = totalT > 0 ? Math.round(totalC / totalT * 100) : null;
  const accCol = acc === null ? C.muted : acc >= 70 ? C.success : acc >= 50 ? C.warning : C.danger;

  const animAcc  = useCountUp(acc, 1000, 500);
  const animSeen = useCountUp(Object.keys(pStats).length, 900, 600);
  const animDue  = useCountUp(dueCount, 700, 700);

  const [weekOffset, setWeekOffset] = useState(0);
  const [goalTarget, setGoalTarget] = useState(() => goalStore.get());
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [tooltip, setTooltip] = useState(null); // { x, y, date, count }
  const heatmapRef = useRef(null);
  const [ringsReady, setRingsReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRingsReady(true), 500); return () => clearTimeout(t); }, []);

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

  const modes = [
    { k: V.PRACTICE, icon: "▷", label: "Practice",     col: C.accent },
    { k: V.SR,       icon: "↻", label: `Flashcards${dueCount > 0 ? ` (${dueCount})` : ""}`, col: dueCount > 0 ? C.success : C.sub },
    { k: V.WRONG,    icon: "✕", label: "Wrong Answers", col: C.danger },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={pageWrap}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ animation: "dash-left 0.55s cubic-bezier(0.22,1,0.36,1) both" }}>
          <h1 style={h1}>{greeting}.</h1>
          <p style={{ color: C.sub, marginTop: 5, fontSize: 15, fontWeight: 300 }}>
            {totalT === 0 ? "Start practising to track your progress." : `${totalT} questions answered · ${acc ?? 0}% accuracy`}
          </p>
        </div>
        {streak.streak > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            background: "rgba(246,197,77,0.08)", borderRadius: 99,
            padding: "5px 12px 5px 8px",
            border: "1px solid rgba(246,197,77,0.18)",
            animation: "spring-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.15s both",
          }}>
            <span style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.warning }}>{streak.streak}</span>
            <span style={{ fontSize: 13, color: C.muted }}>day streak</span>
          </div>
        )}
      </div>

      {/* Heatmap */}
      <div style={{ ...card, padding: "20px 22px", animation: "sweep-reveal 0.75s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Activity</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: C.muted }}>{totalThisWeek} this week</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setWeekOffset(o => o - 4)} className="btn-press" style={{
                background: "none", border: "1px solid var(--c-border)", borderRadius: 6,
                color: C.muted, fontSize: 13, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
              }}>‹</button>
              {weekOffset < 0 && (
                <button onClick={() => setWeekOffset(0)} className="btn-press" style={{
                  background: "none", border: "1px solid var(--c-border)", borderRadius: 6,
                  color: C.accent, fontSize: 12, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
                }}>Today</button>
              )}
              <button onClick={() => setWeekOffset(o => Math.min(0, o + 4))} className="btn-press"
                disabled={weekOffset >= 0}
                style={{
                  background: "none", border: "1px solid var(--c-border)", borderRadius: 6,
                  color: weekOffset >= 0 ? C.mutedDim : C.muted, fontSize: 13, padding: "2px 8px",
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
                        flex: 1, aspectRatio: "1/1", borderRadius: 3,
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
            <div key={pct} style={{ width: 12, height: 12, borderRadius: 2, background: heatColor(pct * maxActivity, maxActivity) }} />
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
          borderRadius: 8, padding: "7px 11px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          pointerEvents: "none", zIndex: 999,
          fontSize: 13, whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, color: C.text, marginBottom: 2 }}>
            {tooltip.count > 0 ? `${tooltip.count} question${tooltip.count !== 1 ? "s" : ""}` : "No activity"}
          </div>
          <div style={{ color: C.muted }}>
            {tooltip.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      )}

      {/* Stat rings */}
      {(() => {
        const R = 52, SW = 5, CIRC = 2 * Math.PI * R, SIZE = (R + SW) * 2;
        const goalCol = todayCount >= goalTarget ? C.success : todayCount >= goalTarget * 0.7 ? C.warning : C.accent;
        const rings = [
          {
            label: "Accuracy", sub: `${totalC}/${totalT} correct`,
            progress: acc !== null ? acc / 100 : 0,
            display: acc !== null ? animAcc + "%" : "—",
            color: accCol, delay: "0.45s",
          },
          {
            label: "Today's goal", sub: null,
            progress: Math.min(todayCount / goalTarget, 1),
            display: String(todayCount),
            color: goalCol, delay: "0.52s",
          },
          {
            label: "Questions seen", sub: `of ${QUESTIONS.length}`,
            progress: QUESTIONS.length > 0 ? Object.keys(pStats).length / QUESTIONS.length : 0,
            display: String(animSeen),
            color: C.accentLt, delay: "0.59s",
          },
        ];
        return (
          <div style={{
            display: "flex", justifyContent: "space-around", alignItems: "center",
            marginTop: 16,
            animation: "sweep-reveal 0.75s cubic-bezier(0.25,0.46,0.45,0.94) 0.3s both",
          }}>
            {rings.map((ring, ri) => {
              const dashOffset = CIRC * (1 - ring.progress);
              return (
                <div key={ring.label} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                  animation: `spring-pop 0.65s cubic-bezier(0.34,1.56,0.64,1) ${ring.delay} both`,
                }}>
                  <div style={{ position: "relative", width: SIZE, height: SIZE }}>
                    <svg width={SIZE} height={SIZE}>
                      <defs>
                        <filter id={`glow-${ri}`} x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                        </filter>
                      </defs>
                      {/* Track */}
                      <circle cx={R+SW} cy={R+SW} r={R} fill="none" stroke="var(--c-border)" strokeWidth={SW+1} />
                      {/* Glow */}
                      {ring.progress > 0 && (
                        <circle cx={R+SW} cy={R+SW} r={R} fill="none"
                          stroke={ring.color} strokeWidth={SW+2}
                          strokeDasharray={CIRC} strokeDashoffset={ringsReady ? dashOffset : CIRC}
                          strokeLinecap="round"
                          transform={`rotate(-90 ${R+SW} ${R+SW})`}
                          opacity={0.3} filter={`url(#glow-${ri})`}
                          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
                        />
                      )}
                      {/* Arc */}
                      <circle cx={R+SW} cy={R+SW} r={R} fill="none"
                        stroke={ring.color} strokeWidth={SW}
                        strokeDasharray={CIRC} strokeDashoffset={ringsReady ? dashOffset : CIRC}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${R+SW} ${R+SW})`}
                        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
                      />
                    </svg>
                    {/* Centre number */}
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ fontSize: 22, fontWeight: 300, color: ring.color, letterSpacing: -0.5, lineHeight: 1 }}>
                        {ring.display}
                      </div>
                    </div>
                  </div>
                  {/* Label */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ring.label}</div>
                    {ri === 1 ? (
                      editingGoal ? (
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
                              width: 60, background: "transparent", border: "none",
                              borderBottom: `1px solid ${C.accentBrd}`, outline: "none",
                              fontSize: 12, color: C.accent, fontFamily: "inherit",
                              textAlign: "center", padding: "2px 0", marginTop: 3,
                            }}
                          />
                        </form>
                      ) : (
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          {todayCount >= goalTarget ? "✓ " : ""}{todayCount}/{goalTarget}
                          <button onClick={() => { setGoalDraft(String(goalTarget)); setEditingGoal(true); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.mutedDim, fontSize: 11, padding: 0 }}
                            onMouseEnter={e => e.currentTarget.style.color = C.muted}
                            onMouseLeave={e => e.currentTarget.style.color = C.mutedDim}
                          >✎</button>
                        </div>
                      )
                    ) : (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{ring.sub}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Stats link */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setView(V.STATS)} className="btn-press" style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 13, color: C.muted, display: "flex", alignItems: "center", gap: 4,
          padding: "2px 0",
          transition: "color 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.color = C.accent}
          onMouseLeave={e => e.currentTarget.style.color = C.muted}
        >
          View detailed stats →
        </button>
      </div>

      {/* Quick launch */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {modes.map((m, i) => (
          <button key={m.k} onClick={() => setView(m.k)} className="hover-lift btn-press" style={{
            background: "var(--c-card-bg)", borderRadius: 12,
            padding: "16px 14px", textAlign: "center",
            border: "1px solid var(--c-border)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            cursor: "pointer", fontFamily: "inherit",
            animation: `rise-blur 0.55s cubic-bezier(0.22,1,0.36,1) ${0.7 + i * 0.07}s both`,
          }}>
            <div style={{ fontSize: 20, color: m.col, marginBottom: 8 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{m.label}</div>
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
