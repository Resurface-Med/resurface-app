import { useRef, useEffect, useState } from "react";
import { NAV, V } from "../constants";
import { QUESTIONS } from "../data/questions";
import { POMODORO_MODES } from "../utils/pomodoro";

const NAV_TEXT   = "var(--c-nav-text)";
const NAV_SUB    = "var(--c-nav-sub)";
const NAV_MUTED  = "var(--c-nav-muted)";
const NAV_MUTDIM = "var(--c-nav-muted-dim)";

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Sidebar({ view, setView, dueCount, bmCount, wrongCount, pomodoro }) {
  const navRef  = useRef(null);
  const itemRefs = useRef([]);
  const [pill, setPill] = useState({ top: 12, height: 40 });

  useEffect(() => {
    const idx = NAV.findIndex(i => i && i.k === view);
    const el  = itemRefs.current[idx];
    if (el && navRef.current) setPill({ top: el.offsetTop, height: el.offsetHeight });
  }, [view]);

  const { mode, timeLeft, running } = pomodoro || {};
  const pomColor = mode ? POMODORO_MODES[mode].color : "#4d8ef5";
  const isActive = running || (mode && timeLeft < POMODORO_MODES[mode].duration && timeLeft > 0);

  return (
    <aside style={{
      width: 232,
      background: "var(--c-nav-bg)",
      borderRight: "1px solid var(--c-nav-border)",
      display: "flex", flexDirection: "column", flexShrink: 0,
      position: "sticky", top: 0, height: "var(--app-vh)",
    }}>
      {/* Logo */}
      <div style={{
        padding: "14px 0 14px",
        borderBottom: "1px solid var(--c-nav-border)",
        background: "radial-gradient(ellipse 120% 100% at 50% 0%, rgba(77,142,245,0.22) 0%, transparent 75%)",
        overflow: "hidden",
      }}>
        <img src="/logo.png" alt="Ascend" style={{
          width: "100%", height: "auto", display: "block",
          marginLeft: "0",
          animation: "sweep-reveal 1.1s cubic-bezier(0.25,0.46,0.45,0.94) both",
        }} />
      </div>

      {/* Nav */}
      <nav ref={navRef} style={{ padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 1, position: "relative", overflowY: "auto" }}>

        {/* Glassmorphic pill */}
        <div style={{
          position: "absolute",
          left: 8, right: 8,
          top: pill.top, height: pill.height,
          borderRadius: 12,
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(77,142,245,0.15)",
          transition: "top 0.38s cubic-bezier(0.34,1.56,0.64,1), height 0.2s ease",
          pointerEvents: "none", zIndex: 0,
        }}>
          {/* Left accent bar */}
          <div style={{
            position: "absolute",
            left: 0, top: "15%", bottom: "15%",
            width: 2.5, borderRadius: 99,
            background: "linear-gradient(180deg, transparent, #7ab0ff, #4d8ef5, transparent)",
            boxShadow: "0 0 8px rgba(77,142,245,0.7), 0 0 20px rgba(77,142,245,0.4)",
          }} />
          {/* Top edge shimmer — glass catching light */}
          <div style={{
            position: "absolute",
            top: 0, left: 10, right: 10, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
            borderRadius: 99,
          }} />
        </div>

        {NAV.map((item, idx) => {
          if (!item) return (
            <div key={`div-${idx}`} style={{
              height: 1, background: "var(--c-nav-border)",
              margin: "6px 4px",
            }} />
          );

          const active = view === item.k;
          const badge = item.k === V.SR ? dueCount
            : item.k === V.WRONG ? wrongCount
            : 0;

          return (
            <button
              key={item.k}
              ref={el => { if (item) itemRefs.current[idx] = el; }}
              onClick={() => setView(item.k)}
              className="btn-press"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 13px", borderRadius: 12,
                border: "1px solid transparent", background: "transparent",
                color: active ? NAV_TEXT : NAV_SUB,
                fontSize: 15, textAlign: "left", cursor: "pointer",
                width: "100%", fontFamily: "inherit", letterSpacing: 0.1,
                position: "relative", zIndex: 1,
                transition: "color 0.2s",
              }}
            >
              <span style={{
                fontSize: 15, width: 18, textAlign: "center", flexShrink: 0, lineHeight: 1,
                color: active ? "#7ab0ff" : item.k === V.POMODORO && running ? pomColor : NAV_MUTED,
                transition: "color 0.2s",
              }}>{item.icon}</span>

              <span style={{ fontWeight: active ? 600 : 500 }}>{item.label}</span>

              {/* Pomodoro live chip */}
              {item.k === V.POMODORO && isActive && (
                <span style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 700,
                  color: running ? pomColor : NAV_MUTED,
                  background: running ? `${pomColor}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${running ? pomColor + "44" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 20, padding: "2px 7px",
                  fontVariantNumeric: "tabular-nums",
                  transition: "all 0.3s",
                }}>
                  {running && <span style={{
                    width: 5, height: 5, borderRadius: 99,
                    background: pomColor, display: "inline-block",
                    animation: "badge-pulse 1.8s ease-in-out infinite",
                  }} />}
                  {fmtTime(timeLeft)}
                </span>
              )}

              {/* Normal badges */}
              {item.k !== V.POMODORO && badge > 0 && (
                <span className="anim-badge-pulse" style={{
                  marginLeft: "auto",
                  background: item.k === V.SR ? "#f97b3d" : item.k === V.WRONG ? "#f56565" : "#4d8ef5",
                  color: "#fff", borderRadius: 20, fontSize: 11,
                  fontWeight: 700, padding: "2px 8px",
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--c-nav-border)" }}>
        <div style={{ color: NAV_MUTDIM, fontSize: 12, letterSpacing: 0.2 }}>© Ascend 2026</div>
      </div>
    </aside>
  );
}
