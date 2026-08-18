import { useRef, useLayoutEffect, useState } from "react";
import { NAV, V } from "../ui/theme";

const NAV_SUB    = "var(--c-nav-sub)";
const NAV_MUTED  = "var(--c-nav-muted)";
const NAV_MUTDIM = "var(--c-nav-muted-dim)";

function initials(displayName, email) {
  const n = String(displayName || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts[1]?.[0] || "";
    return (a + b || n.slice(0, 2)).toUpperCase();
  }
  return String(email || "?").slice(0, 1).toUpperCase();
}

export function Sidebar({ view, setView, dueCount, email, displayName, onSignOut }) {
  const navRef  = useRef(null);
  const itemRefs = useRef([]);
  const [pill, setPill] = useState({ top: 12, height: 40, visible: true });

  useLayoutEffect(() => {
    const idx = NAV.findIndex(i => i && i.k === view);
    const el  = itemRefs.current[idx];
    if (idx < 0 || !el || !navRef.current) {
      setPill(p => ({ ...p, visible: false }));
      return;
    }
    setPill({ top: el.offsetTop, height: el.offsetHeight, visible: true });
  }, [view]);

  const activeProfile = view === V.PROFILE;

  return (
    <aside className="app-nav" style={{
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
      <div className="app-nav__brand" style={{
        padding: "18px 16px 16px",
        borderBottom: "1px solid var(--c-nav-border)",
      }}>
        <img
          src="/logo-lockup.png"
          alt="Resurface"
          width="720"
          height="190"
          className="nav-logo nav-logo-day"
          style={{
            width: "100%",
            maxWidth: 172,
            height: "auto",
            display: "block",
          }}
        />
        <img
          src="/logo-lockup-white.png"
          alt=""
          aria-hidden="true"
          width="720"
          height="190"
          className="nav-logo nav-logo-night"
          style={{
            width: "100%",
            maxWidth: 172,
            height: "auto",
            display: "none",
          }}
        />
      </div>

      <nav ref={navRef} className="app-nav__list" style={{
        padding: "12px 10px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        position: "relative",
        overflowY: "auto",
      }}>
        <div style={{
          position: "absolute",
          left: 8, right: 8, top: 0,
          height: pill.height,
          transform: `translateY(${pill.top}px)`,
          borderRadius: "var(--r-pill)",
          background: "var(--c-accent)",
          boxShadow: "0 8px 20px rgba(20, 44, 130, 0.28)",
          transition: "transform 0.24s cubic-bezier(0.22,1,0.36,1), opacity 0.18s",
          willChange: "transform",
          // class hook so the bottom bar can drop it entirely
          pointerEvents: "none", zIndex: 0,
          opacity: pill.visible ? 1 : 0,
        }} className="app-nav__pill" />

        {NAV.map((item, idx) => {
          if (!item) return (
            <div key={`div-${idx}`} style={{
              height: 1, background: "var(--c-nav-border)",
              margin: "8px 8px",
            }} />
          );

          const active = view === item.k;
          const badge = item.k === V.STUDY ? dueCount : 0;

          return (
            <button
              key={item.k}
              ref={el => { if (item) itemRefs.current[idx] = el; }}
              onClick={() => setView(item.k)}
              className={`btn-press app-nav__item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
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
              <span className="app-nav__label" style={{ fontWeight: active ? 600 : 500 }}>{item.label}</span>

              {badge > 0 && (
                <span className="app-nav__badge" style={{
                  marginLeft: "auto",
                  background: active ? "rgba(255,255,255,0.25)" : "var(--c-accent)",
                  color: "#fff", borderRadius: "var(--r-pill)", fontSize: 11,
                  fontWeight: 700, padding: "2px 8px",
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="app-nav__foot" style={{ padding: "12px 12px 14px", borderTop: "1px solid var(--c-nav-border)" }}>
        <button
          type="button"
          onClick={() => setView(V.PROFILE)}
          className={`btn-press app-nav__profile${activeProfile ? " is-active" : ""}`}
          title="Profile"
          aria-current={activeProfile ? "page" : undefined}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: "var(--r-pill)",
            border: activeProfile ? "1px solid var(--c-accent-brd)" : "1px solid transparent",
            background: activeProfile ? "var(--c-accent-dim)" : "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            color: NAV_SUB,
          }}
        >
          <span style={{
            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
            display: "grid", placeItems: "center",
            background: "var(--c-accent)",
            color: "#fff",
            fontSize: 12, fontWeight: 700, letterSpacing: -0.2,
          }}>
            {initials(displayName, email)}
          </span>
          <span className="app-nav__profile-text" style={{ minWidth: 0, flex: 1 }}>
            <span style={{
              display: "block",
              fontSize: 13, fontWeight: 600, letterSpacing: -0.15,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              color: "var(--c-nav-text)",
            }}>
              {displayName?.trim() || "Profile"}
            </span>
            {email && (
              <span style={{
                display: "block",
                fontSize: 11, fontWeight: 500, color: NAV_MUTED,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {email}
              </span>
            )}
          </span>
        </button>
        <div className="app-nav__foot-meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, padding: "0 4px" }}>
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
