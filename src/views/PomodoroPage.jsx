import { C, pageWrap, h1, pageSub, OF } from "../ui/theme";
import { POMODORO_MODES } from "../lib/pomodoro";

const R  = 108;
const SW = 6;
const SIZE = (R + SW) * 2;
const CIRC = 2 * Math.PI * R;

export default function PomodoroPage({ mode, timeLeft, running, count, toggle, reset, skip, switchMode }) {
  const { label, duration, onField, onFieldGlow } = POMODORO_MODES[mode];
  const progress   = timeLeft / duration;
  const dashOffset = CIRC * (1 - progress);

  const mins   = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs   = String(timeLeft % 60).padStart(2, "0");
  const status = running ? "running" : timeLeft === duration ? "ready" : timeLeft === 0 ? "done ✓" : "paused";

  return (
    <div style={pageWrap}>

      {/* Header */}
      <div style={{ animation: "dash-left 0.24s cubic-bezier(0.22,1,0.36,1) both" }}>
        <h1 style={h1}>Pomodoro.</h1>
        <p style={pageSub}>
          {count === 0 ? "Start a focus session to track your study time." : `${count} session${count !== 1 ? "s" : ""} completed today`}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="anim-fade-up delay-50" style={{
        display: "flex", gap: 8,
        background: "var(--c-card-bg)", borderRadius: "var(--r-panel)",
        padding: 6, border: "1px solid var(--c-border)",
        boxShadow: "var(--c-card-shadow)",
        alignSelf: "flex-start",
      }}>
        {Object.entries(POMODORO_MODES).map(([k, m]) => (
          <button key={k} type="button" onClick={() => switchMode(k)} style={{
            padding: "8px 20px", borderRadius: "var(--r-pill)", border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 14, fontWeight: 600, letterSpacing: -0.15,
            background: mode === k ? m.color : "transparent",
            color: mode === k ? "#fff" : C.muted,
            boxShadow: mode === k ? `0 8px 20px ${m.glow}` : "none",
            transition: "all 0.2s",
          }}>{m.label}</button>
        ))}
      </div>

      {/* Big ring */}
      <div className="anim-fade-up delay-100" style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: SIZE, height: SIZE }}>

          {/* SVG — glow is rendered inside so it's mathematically circular */}
          <svg width={SIZE} height={SIZE} style={{ overflow: "visible", position: "relative", zIndex: 1 }}>
            <defs>
              <filter id="ring-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="10" result="blur" />
              </filter>
              <filter id="ring-glow-soft" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="22" result="blur" />
              </filter>
            </defs>

            {/* Track */}
            <circle cx={R + SW} cy={R + SW} r={R}
              fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={SW + 1} />

            {/* Glow layers — blurry copies of the full ring, drawn behind the arc */}
            {running && <>
              <circle cx={R + SW} cy={R + SW} r={R}
                fill="none" stroke={onField} strokeWidth={SW + 2}
                opacity={0.45} filter="url(#ring-glow)"
                style={{ animation: "pulse-glow-pomo 3s ease-in-out infinite" }}
              />
              <circle cx={R + SW} cy={R + SW} r={R}
                fill="none" stroke={onField} strokeWidth={SW}
                opacity={0.2} filter="url(#ring-glow-soft)"
                style={{ animation: "pulse-glow-pomo 3s ease-in-out infinite" }}
              />
            </>}

            {/* Progress arc */}
            <circle cx={R + SW} cy={R + SW} r={R}
              fill="none" stroke={onField} strokeWidth={SW}
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${R + SW} ${R + SW})`}
              style={{ transition: running ? "stroke-dashoffset 0.5s linear" : "stroke-dashoffset 0.35s ease" }}
            />
          </svg>

          {/* Time + label centered inside ring */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 4,
          }}>
            <div style={{
              fontSize: 56, fontWeight: 200, letterSpacing: -2,
              color: OF.text, lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              transition: "color 0.3s",
            }}>{mins}:{secs}</div>
            <div style={{
              fontSize: 12, fontWeight: 600, letterSpacing: 1.5,
              color: onField, textTransform: "uppercase", opacity: 0.95,
            }}>{label}</div>
            <div style={{ fontSize: 12, color: OF.soft, letterSpacing: 0.5, marginTop: 2 }}>
              {status}
            </div>
          </div>
        </div>
      </div>

      {/* Session dots */}
      <div className="anim-fade-up delay-150" style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: i < count % 4 ? 14 : 10,
            height: i < count % 4 ? 14 : 10,
            borderRadius: 99,
            background: i < count % 4 ? onField : "rgba(255,255,255,0.28)",
            boxShadow: i < count % 4 ? `0 0 10px ${onFieldGlow}` : "none",
            transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
          }} />
        ))}
      </div>

      {/* Controls */}
      <div className="anim-fade-up delay-200" style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
        <button type="button" onClick={reset} className="btn-press" style={{
          width: 48, height: 48, borderRadius: "var(--r-pill)",
          background: "var(--c-card-bg)", border: "1px solid var(--c-border)",
          cursor: "pointer", fontSize: 18, color: C.sub,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--c-card-shadow)",
          transition: "border-color 0.2s, color 0.2s",
        }} title="Reset">↺</button>

        <button type="button" onClick={toggle} className="btn-press" style={{
          width: 72, height: 72, borderRadius: "var(--r-pill)", border: "none",
          cursor: "pointer", fontSize: running ? 22 : 20,
          background: "#fff",
          color: "var(--blue, #3562f5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 12px 30px rgba(15,27,61,0.28)",
          transition: "background 0.25s, box-shadow 0.25s, transform 0.1s",
        }} title={running ? "Pause" : "Start"}>
          {running ? "⏸" : "▷"}
        </button>

        <button type="button" onClick={skip} className="btn-press" style={{
          width: 48, height: 48, borderRadius: "var(--r-pill)",
          background: "var(--c-card-bg)", border: "1px solid var(--c-border)",
          cursor: "pointer", fontSize: 16, color: C.sub,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "var(--c-card-shadow)",
          transition: "border-color 0.2s, color 0.2s",
        }} title="Skip to next">⏭</button>
      </div>

      {/* Tips */}
      <div className="anim-fade-up delay-300" style={{
        textAlign: "center", fontSize: 14, color: OF.soft, lineHeight: 1.7,
      }}>
        {mode === "work"
          ? "Stay focused. Close other tabs, silence your phone."
          : "Step away from the screen. Stretch, breathe, hydrate."}
      </div>

    </div>
  );
}
