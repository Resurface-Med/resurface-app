import { useEffect, useState } from "react";
import { BookOpen, ChartColumn, Flag, House, LogOut, PanelLeft, Sparkles, Trophy } from "lucide-react";
import { NAV_GROUPS, V } from "../ui/theme";

const ICONS = {
  [V.DASH]: House,
  [V.STUDY]: BookOpen,
  [V.GENERATE]: Sparkles,
  [V.PROGRESS]: ChartColumn,
  [V.LEADERBOARD]: Trophy,
  [V.ADMIN]: Flag,
};

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

export function Sidebar({ view, setView, dueCount, email, displayName, onSignOut, isAdmin = false, tight = false, onTightChange }) {
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

      <aside id="app-nav" className={`app-nav${open ? " is-open" : ""}${tight ? " is-tight" : ""}`}>
        <div className="app-nav__brand">
          <img
            src="/logo-lockup.png"
            alt="Resurface"
            width="720"
            height="190"
            className="nav-logo nav-logo-day app-nav__logo"
          />
          <img
            src="/logo-lockup-white.png"
            alt=""
            aria-hidden="true"
            width="720"
            height="190"
            className="nav-logo nav-logo-night app-nav__logo"
          />
          {/* Cut from the lockup, so the two can never drift apart. Shown
              only when the sidebar is too narrow for the wordmark. */}
          <img src="/logo-mark.png" alt="Resurface" width="99" height="131"
            className="nav-logo nav-logo-day app-nav__mark" />
          <img src="/logo-mark-white.png" alt="" aria-hidden="true" width="99" height="131"
            className="nav-logo nav-logo-night app-nav__mark" />
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

        <nav className="app-nav__list">
          {/* Admin is a group of its own behind the one rule, after
              everything a student uses, and only for an account the
              database calls an admin. */}
          {(isAdmin ? [...NAV_GROUPS, [{ k: V.ADMIN, label: "Admin", ruled: true }]] : NAV_GROUPS)
            .map((group, gi) => (
              <div key={gi} className={`app-nav__group${group[0]?.ruled ? " is-ruled" : ""}`}>
                {group.map(item => {
                  const active = view === item.k;
                  const Icon = ICONS[item.k];
                  const review = item.k === V.STUDY ? dueCount : 0;

                  return (
                    <button
                      key={item.k}
                      type="button"
                      onClick={() => go(item.k)}
                      className={`btn-press app-nav__item${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                    >
                      {Icon && <Icon className="app-nav__icon" size={18} strokeWidth={1.75} aria-hidden="true" />}
                      <span className="app-nav__label">{item.label}</span>
                      {review > 0 && (
                        <span className="app-nav__review">
                          <span className="app-nav__review-text">{review} to review</span>
                          <span className="app-nav__review-dot" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
        </nav>

        <div className="app-nav__foot">
          {/* Desktop only: on a phone the sidebar is a drawer that is either
              open or gone, and a narrower drawer helps nobody. */}
          <button
            type="button"
            className="app-nav__tight btn-press"
            onClick={() => onTightChange?.(!tight)}
            aria-pressed={tight}
            aria-label={tight ? "Widen the sidebar" : "Narrow the sidebar"}
            title={tight ? "Widen" : "Narrow"}
          >
            <PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="app-nav__label">Narrow</span>
          </button>

          <div className={`app-nav__account${activeProfile ? " is-active" : ""}`}>
            <button
              type="button"
              onClick={() => go(V.PROFILE)}
              className="btn-press app-nav__profile"
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
              </span>
            </button>
            <button type="button" onClick={onSignOut} className="btn-press app-nav__signout" aria-label="Sign out" title="Sign out">
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
