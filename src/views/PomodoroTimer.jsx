import { useState, useEffect, useRef } from "react";

const MODES = {
  work:       { label: "Focus",        duration: 25 * 60, color: "#3562f5", dim: "rgba(53,98,245,0.15)" },
  shortBreak: { label: "Short Break",  duration:  5 * 60, color: "#3ecf8e", dim: "rgba(62,207,142,0.15)" },
  longBreak:  { label: "Long Break",   duration: 15 * 60, color: "#f6c54d", dim: "rgba(246,197,77,0.15)"  },
};

const R  = 22;
const SW = 2.5;
const CIRC = 2 * Math.PI * R;
const SIZE = (R + SW) * 2;

export default function PomodoroTimer() {
  const [mode, setMode]       = useState("work");
  const [timeLeft, setTimeLeft] = useState(MODES.work.duration);
  const [running, setRunning] = useState(false);
  const [count, setCount]     = useState(0); // completed work sessions
  const [flash, setFlash]     = useState(false);

  // Refs so advance() never captures stale closure values
  const modeRef  = useRef("work");
  const countRef = useRef(0);
  modeRef.current  = mode;
  countRef.current = count;

  // Wall-clock-based tick so background throttling doesn't drift the timer
  const startedAtRef  = useRef(null); // Date.now() when running started
  const startLeftRef  = useRef(null); // timeLeft when running started

  useEffect(() => {
    if (!running) return;
    startedAtRef.current = Date.now();
    startLeftRef.current = timeLeft;

    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const next = Math.max(0, startLeftRef.current - elapsed);
      setTimeLeft(next);
      if (next === 0) {
        clearInterval(id);
        setRunning(false);
        doAdvance();
      }
    }, 500); // poll twice/sec for accuracy

    return () => clearInterval(id);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  function doAdvance() {
    // Browser notification
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const m = modeRef.current;
      new Notification(m === "work" ? "Break time! 🎉" : "Back to work! 💪", {
        body: m === "work" ? "Great session. Take a breather." : "Focus session starting.",
        silent: false,
      });
    }
    // Flash
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);

    const m = modeRef.current;
    if (m === "work") {
      const nc = countRef.current + 1;
      setCount(nc);
      const next = nc % 4 === 0 ? "longBreak" : "shortBreak";
      setMode(next);
      setTimeLeft(MODES[next].duration);
    } else {
      setMode("work");
      setTimeLeft(MODES.work.duration);
    }
  }

  function toggle() {
    if (timeLeft === 0) return;
    if (!running && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setRunning(r => !r);
  }

  function reset() {
    setRunning(false);
    setTimeLeft(MODES[mode].duration);
  }

  function skip() {
    setRunning(false);
    setTimeLeft(0);
    doAdvance();
  }

  function switchMode(m) {
    setRunning(false);
    setMode(m);
    setTimeLeft(MODES[m].duration);
  }

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
