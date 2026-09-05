import { useEffect, useState } from "react";
import { NAV, V } from "../ui/theme";
import Wave from "../ui/Wave";

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
  const activeProfile = view === V.PROFILE;
  const [open, setOpen] = useState(false);

  // Escape closes it, and while it is open the page behind must not scroll.
  // Inline overflow:hidden alone makes iOS Safari drop the brand field in the
  // notch and URL-bar gutters — fixed body + restored scroll position avoids that.
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    const scrollY = window.scrollY;
    document.documentElement.classList.add("is-nav-open");
    document.body.classList.add("is-nav-open");
    document.body.style.setProperty("--nav-scroll-y", `${scrollY}px`);
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("is-nav-open");
      document.body.classList.remove("is-nav-open");
      document.body.style.removeProperty("--nav-scroll-y");
      window.scrollTo(0, scrollY);
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
        {/* Same blue field → wave → white sheet the rest of the app uses. */}
        <div className="app-nav__field">
          <img
            src="/logo-lockup-white.png"
            alt="Resurface"
            width="720"
            height="190"
            className="nav-logo app-nav__logo"
          />
          <button
            type="button"
            className="app-nav__close btn-press"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="app-nav__wave">
          <Wave from="transparent" to="var(--c-card-solid)" height="clamp(28px, 4vw, 40px)" />
        </div>

        <div className="app-nav__sheet">
          <nav className="app-nav__list">
            {NAV.map((item, idx) => {
              if (!item) {
                return <div key={`div-${idx}`} className="app-nav__rule" />;
              }

              const active = view === item.k;
              const badge = item.k === V.STUDY ? dueCount : 0;

              return (
                <button
                  key={item.k}
                  type="button"
                  onClick={() => go(item.k)}
                  className={`btn-press app-nav__item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="app-nav__label">{item.label}</span>
                  {badge > 0 && <span className="app-nav__badge">{badge}</span>}
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
              <span className="app-nav__profile-text">
                <span className="app-nav__profile-name">
                  {displayName?.trim() || "Profile"}
                </span>
                {email && (
                  <span className="app-nav__profile-email">{email}</span>
                )}
              </span>
            </button>
            <div className="app-nav__foot-meta">
              <span className="app-nav__copy">© Resurface 2026</span>
              <button type="button" onClick={onSignOut} className="btn-press app-nav__signout">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
