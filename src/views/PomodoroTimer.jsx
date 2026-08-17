import { POMODORO_MODES as MODES } from "../lib/pomodoro";

const R  = 22;
const SW = 2.5;
const CIRC = 2 * Math.PI * R;
const SIZE = (R + SW) * 2;

/**
 * The timer, in the sidebar footer.
 *
 * It used to run its own state, its own wall-clock tick and its own copy of the
 * mode table, none of which were ever rendered — the file was written for this
 * slot and never wired up. It now takes the shared timer from usePomodoro, so
 * there is exactly one clock in the app.
 */
export default function PomodoroTimer({ mode = "work", timeLeft = 0, running = false, count = 0, flash = false, toggle, reset, skip, switchMode }) {
  const { color, dim } = MODES[mode];
  const total    = MODES[mode].duration;
  const progress = timeLeft / total;
  const dashOffset = CIRC * (1 - progress);
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs = String(timeLeft % 60).padStart(2, "0");
  const status = running ? "running" : timeLeft === total ? "ready" : timeLeft === 0 ? "done" : "paused";

  return (
    <div style={{
      borderTop: "1px solid var(--c-nav-border)",
      padding: "14px 14px 12px",
      background: flash ? dim : "transparent",
      transition: "background 0.25s",
    }}>

      {/* Header row: mode tabs + dots */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(MODES).map(([k]) => (
            <button key={k} onClick={() => switchMode(k)} style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 11, fontWeight: 600, letterSpacing: 0.6,
              color: mode === k ? color : "var(--c-nav-muted)",
              textTransform: "uppercase",
              transition: "color 0.2s",
            }}>{k === "work" ? "Focus" : k === "shortBreak" ? "Short" : "Long"}</button>
          ))}
        </div>

        {/* Pomodoro progress dots */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: i < count % 4 || (count % 4 === 0 && count > 0 && i === 3) ? 7 : 6,
              height: i < count % 4 || (count % 4 === 0 && count > 0 && i === 3) ? 7 : 6,
              borderRadius: 99,
              background: i < count % 4 ? color : "var(--c-nav-muted-dim)",
              transition: "background 0.3s, width 0.2s, height 0.2s",
            }} />
          ))}
        </div>
      </div>

      {/* Main row: ring + time + controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

        {/* SVG Ring */}
        <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
          <circle cx={R + SW} cy={R + SW} r={R}
            fill="none" stroke="var(--c-nav-muted-dim)" strokeWidth={SW} />
          <circle cx={R + SW} cy={R + SW} r={R}
            fill="none" stroke={color} strokeWidth={SW}
            strokeDasharray={CIRC} strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${R + SW} ${R + SW})`}
            style={{ transition: running ? "stroke-dashoffset 0.5s linear" : "stroke-dashoffset 0.3s ease", filter: `drop-shadow(0 0 4px ${color}88)` }}
          />
        </svg>

        {/* Time + status */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 22, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1,
            color: "var(--c-nav-text)",
            fontVariantNumeric: "tabular-nums",
          }}>{mins}:{secs}</div>
          <div style={{ fontSize: 11, color: "var(--c-nav-muted)", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {status}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button onClick={toggle} title={running ? "Pause" : "Start"} style={{
            width: 30, height: 30, borderRadius: 99, border: "none", cursor: "pointer",
            background: running ? "rgba(255,255,255,0.07)" : color,
            color: running ? "var(--c-nav-sub)" : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: running ? 13 : 10,
            transition: "background 0.2s",
            boxShadow: running ? "none" : `0 0 12px ${color}66`,
          }}>
            {running ? "⏸" : "▷"}
          </button>
          <button onClick={reset} title="Reset" style={{
            width: 30, height: 30, borderRadius: 99, cursor: "pointer", fontSize: 13,
            background: "transparent", border: "1px solid var(--c-nav-border)",
            color: "var(--c-nav-muted)", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.2s, color 0.2s",
          }}>↺</button>
          <button onClick={skip} title="Skip" style={{
            width: 30, height: 30, borderRadius: 99, cursor: "pointer", fontSize: 11,
            background: "transparent", border: "1px solid var(--c-nav-border)",
            color: "var(--c-nav-muted)", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.2s, color 0.2s",
          }}>⏭</button>
        </div>
      </div>
    </div>
  );
}
