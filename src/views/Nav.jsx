import { useEffect, useRef, useState } from "react";
import { useDrawerSwipe } from "../ui/useDrawerSwipe";
import { BookOpen, ChartColumn, Flag, House, LogOut, Megaphone, NotebookPen, Sparkles, Trophy } from "lucide-react";
import { NAV_GROUPS, V } from "../ui/theme";
import Avatar from "../ui/Avatar";

const ICONS = {
  [V.DASH]: House,
  [V.STUDY]: BookOpen,
  [V.GENERATE]: Sparkles,
  [V.PROGRESS]: ChartColumn,
  [V.LEADERBOARD]: Trophy,
  [V.ADMIN]: Flag,
  [V.NEWS]: Megaphone,
  [V.NOTES]: NotebookPen,
};

export function Sidebar({ view, setView, dueCount, email, displayName, avatar = null, onSignOut, isAdmin = false, unreadAnnouncements = 0, onOpenAnnouncements = null }) {
  const activeProfile = view === V.PROFILE;
  const [open, setOpen] = useState(false);
  const navRef = useRef(null);
  const scrimRef = useRef(null);
  /* Whether the menu button sits over something light (the white sheet),
     so its lines go dark there and stay white over the blue (2026-10-27).
     Read from whatever is actually behind it, so it works on every page
     and in dark mode, where the sheet is dark. */
  const burgerRef = useRef(null);
  const [onLight, setOnLight] = useState(false);
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const b = burgerRef.current;
      /* Hidden (desktop, or in a session): nothing to do. offsetParent is
         null for any fixed element, so it can't say this. */
      if (!b || b.getClientRects().length === 0) return;
      const r = b.getBoundingClientRect();
      const under = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find(el => !b.contains(el));
      let light = false;
      for (let el = under; el; el = el.parentElement) {
        const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
        if (!m || (m.length > 3 && Number(m[3]) < 0.5)) continue;
        const [R, G, B] = m.map(Number);
        light = 0.2126 * R + 0.7152 * G + 0.0722 * B > 170;
        break;
      }
      setOnLight(light);
    };
    const soon = () => { if (!raf) raf = requestAnimationFrame(check); };
    soon();
    window.addEventListener("scroll", soon, { capture: true, passive: true });
    window.addEventListener("resize", soon);
    const t = setInterval(soon, 700);
    return () => { window.removeEventListener("scroll", soon, { capture: true }); window.removeEventListener("resize", soon); clearInterval(t); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useDrawerSwipe({ open, setOpen, navRef, scrimRef });

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
        ref={burgerRef}
        className={`app-nav__burger${onLight ? " is-on-light" : ""}`}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="app-nav"
        onClick={() => setOpen(true)}
      >
        <span className="app-nav__burger-line" />
        <span className="app-nav__burger-line" />
        <span className="app-nav__burger-line" />
        {dueCount > 0 ? <span className="app-nav__burger-dot">{dueCount}</span>
          : unreadAnnouncements > 0 ? <span className="app-nav__burger-dot is-news" aria-label="New announcements" /> : null}
      </button>

      <div
        ref={scrimRef}
        className={`app-nav__scrim${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside ref={navRef} id="app-nav" className={`app-nav${open ? " is-open" : ""}`}>
        <div className="app-nav__brand">
          <img
            src="/logo-wordmark.png"
            alt="Resurface"
            width="441"
            height="131"
            className="nav-logo nav-logo-day app-nav__logo"
          />
          <img
            src="/logo-wordmark-white.png"
            alt=""
            aria-hidden="true"
            width="441"
            height="131"
            className="nav-logo nav-logo-night app-nav__logo"
          />
          {/* Wide screens: the bell sits in the brand row, right of the logo. */}
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
                  const fresh = item.k === V.NEWS ? unreadAnnouncements : 0;

                  return (
                    <button
                      key={item.k}
                      type="button"
                      onClick={() => (item.k === V.NEWS && onOpenAnnouncements ? (onOpenAnnouncements(), setOpen(false)) : go(item.k))}
                      className={`btn-press app-nav__item${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                    >
                      {Icon && <Icon className="app-nav__icon" size={18} strokeWidth={1.75} aria-hidden="true" />}
                      <span className="app-nav__label">{item.label}</span>
                      {fresh > 0 && <span className="app-nav__review app-nav__fresh" title={`${fresh} new`} aria-label={`${fresh} new`}>{fresh > 9 ? "9+" : fresh}</span>}
                      {review > 0 && <span className="app-nav__review" title={`${review} to review`} aria-label={`${review} to review`}>{review > 99 ? "99+" : review}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
        </nav>

        <div className="app-nav__foot">

          <div className={`app-nav__account${activeProfile ? " is-active" : ""}`}>
            <button
              type="button"
              onClick={() => go(V.PROFILE)}
              className="btn-press app-nav__profile"
              title="Profile"
              aria-current={activeProfile ? "page" : undefined}
            >
              <Avatar className="app-nav__avatar" src={avatar} name={displayName} fallback={email} />
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
