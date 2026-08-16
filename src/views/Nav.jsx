import { useRef, useEffect, useState } from "react";
import { NAV, V } from "../ui/theme";
import { POMODORO_MODES } from "../lib/pomodoro";

const NAV_SUB    = "var(--c-nav-sub)";
const NAV_MUTED  = "var(--c-nav-muted)";
const NAV_MUTDIM = "var(--c-nav-muted-dim)";

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Sidebar({ view, setView, dueCount, wrongCount, bmCount, pomodoro, email, onSignOut }) {
  const navRef  = useRef(null);
  const itemRefs = useRef([]);
  const [pill, setPill] = useState({ top: 12, height: 40 });

  useEffect(() => {
    const idx = NAV.findIndex(i => i && i.k === view);
    const el  = itemRefs.current[idx];
    if (el && navRef.current) setPill({ top: el.offsetTop, height: el.offsetHeight });
  }, [view]);

  const { mode, timeLeft, running } = pomodoro || {};
  const pomColor = mode ? POMODORO_MODES[mode].color : "#a1c0ff";
  const isActive = running || (mode && timeLeft < POMODORO_MODES[mode].duration && timeLeft > 0);

  return (
    <aside style={{
      width: 248,
      margin: "14px 0 14px 14px",
      background: "var(--c-nav-bg)",
      border: "1px solid var(--c-nav-border)",
      borderRadius: "var(--r-panel)",
      boxShadow: "var(--c-nav-shadow)",
      backdropFilter: "blur(18px) saturate(160%)",
      WebkitBackdropFilter: "blur(18px) saturate(160%)",
      display: "flex", flexDirection: "column", flexShrink: 0,
      position: "sticky", top: 14, height: "calc(var(--app-vh) - 28px)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "18px 16px 16px",
        borderBottom: "1px solid var(--c-nav-border)",
      }}>
        {/* The coloured lockup, because the sidebar is a white object now —
            the white cut-out would be invisible on it. Same asset the landing
            uses inside its own white nav pill. */}
        <img
          src="/logo-lockup.png"
          alt="Resurface"
          width="720"
          height="190"
          style={{
            width: "100%",
            maxWidth: 172,
            height: "auto",
            display: "block",
          }}
        />
      </div>

      <nav ref={navRef} style={{
        padding: "12px 10px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        position: "relative",
        overflowY: "auto",
      }}>
        {/* Active pill: white island on blue glass */}
        <div style={{
          position: "absolute",
          left: 8, right: 8,
          top: pill.top, height: pill.height,
          borderRadius: "var(--r-pill)",
          background: "var(--c-accent)",
          boxShadow: "0 8px 20px rgba(20, 44, 130, 0.28)",
          transition: "top 0.2s cubic-bezier(0.22,1,0.36,1), height 0.15s ease",
          pointerEvents: "none", zIndex: 0,
        }} />

        {NAV.map((item, idx) => {
          if (!item) return (
            <div key={`div-${idx}`} style={{
              height: 1, background: "var(--c-nav-border)",
              margin: "8px 8px",
            }} />
          );

          const active = view === item.k;
          const badge = item.k === V.REVIEW ? dueCount
            : item.k === V.WRONG ? wrongCount
            : item.k === V.BOOKMARKS ? bmCount
            : 0;

          return (
            <button
              key={item.k}
              ref={el => { if (item) itemRefs.current[idx] = el; }}
              onClick={() => setView(item.k)}
              className="btn-press"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 14px", borderRadius: "var(--r-pill)",
                border: "1px solid transparent", background: "transparent",
                color: active ? "#fff" : NAV_SUB,
                fontSize: 14.5, textAlign: "left", cursor: "pointer",
                width: "100%", fontFamily: "inherit", letterSpacing: -0.15,
                position: "relative", zIndex: 1,
                transition: "color 0.2s",
              }}
            >
              <span style={{
                fontSize: 14, width: 18, textAlign: "center", flexShrink: 0, lineHeight: 1,
                color: active
                  ? "#fff"
                  : item.k === V.POMODORO && running ? pomColor : NAV_MUTED,
                transition: "color 0.2s",
              }}>{item.icon}</span>

              <span style={{ fontWeight: active ? 700 : 500 }}>{item.label}</span>

              {item.k === V.POMODORO && isActive && (
                <span style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 700,
                  color: active ? "#fff" : (running ? pomColor : NAV_MUTED),
                  background: active ? "rgba(255,255,255,0.2)" : "var(--c-wash)",
                  border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "var(--c-border)"}`,
                  borderRadius: "var(--r-pill)", padding: "2px 8px",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {running && <span style={{
                    width: 5, height: 5, borderRadius: 99,
                    background: active ? "#fff" : pomColor, display: "inline-block",
                    animation: "badge-pulse 1.8s ease-in-out infinite",
                  }} />}
                  {fmtTime(timeLeft)}
                </span>
              )}

              {item.k !== V.POMODORO && badge > 0 && (
                <span className="anim-badge-pulse" style={{
                  marginLeft: "auto",
                  background: active
                    ? "rgba(255,255,255,0.25)"
                    : item.k === V.REVIEW ? "var(--c-orange)"
                    : item.k === V.WRONG ? "var(--c-danger)"
                    : "var(--c-muted-dim)",
                  color: "#fff", borderRadius: "var(--r-pill)", fontSize: 11,
                  fontWeight: 700, padding: "2px 8px",
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--c-nav-border)" }}>
        {email && (
          <div style={{
            fontSize: 12, color: NAV_SUB, fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={email}>{email}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ color: NAV_MUTDIM, fontSize: 11.5, fontWeight: 500 }}>© Resurface 2026</span>
          <button onClick={onSignOut} className="btn-press" style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: NAV_SUB,
          }}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
