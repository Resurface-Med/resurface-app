import { useRef, useLayoutEffect, useEffect, useState } from "react";
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
  const [open, setOpen] = useState(false);

  // Escape closes it, and while it is open the page behind must not scroll —
  // otherwise a drag anywhere on the dimmed area moves the content underneath,
  // which reads as the drawer having lost its place.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Navigating is the end of the drawer's job. */
  function go(k) {
    setView(k);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="app-nav__burger"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="app-nav"
        onClick={() => setOpen(true)}
      >
        <span className="app-nav__burger-line" />
        <span className="app-nav__burger-line" />
        <span className="app-nav__burger-line" />
        {dueCount > 0 && <span className="app-nav__burger-dot">{dueCount}</span>}
      </button>

      <div
        className={`app-nav__scrim${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

    <aside id="app-nav" className={`app-nav${open ? " is-open" : ""}`}>
      <div className="app-nav__brand">
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

      <nav ref={navRef} className="app-nav__list">
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
              onClick={() => go(item.k)}
              className={`btn-press app-nav__item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="app-nav__label" style={{ fontWeight: active ? 600 : 500 }}>{item.label}</span>

              {badge > 0 && (
                <span className="app-nav__badge">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="app-nav__foot">
        <button
          type="button"
          onClick={() => go(V.PROFILE)}
          className={`btn-press app-nav__profile${activeProfile ? " is-active" : ""}`}
          title="Profile"
          aria-current={activeProfile ? "page" : undefined}
        >
          <span className="app-nav__avatar">
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
        <div className="app-nav__foot-meta">
          <span style={{ color: NAV_MUTDIM, fontSize: 11.5, fontWeight: 500 }}>© Resurface 2026</span>
          <button onClick={onSignOut} className="btn-press" style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: NAV_SUB,
          }}>Sign out</button>
        </div>
      </div>
    </aside>
    </>
  );
}
