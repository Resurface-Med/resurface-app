import { useEffect, useRef, useState } from "react";

/**
 * Pull down at the top of a screen to refresh, on a phone.
 *
 * iOS gives a home-screen app no pull-to-refresh of its own, and most screens
 * here scroll inside a container rather than the page, where Safari's would
 * not reach either. So: a touch that starts with everything under it scrolled
 * to the top, and moves mostly downward, pulls a spinner in from the top. Its
 * arc draws round as you pull, closing at the threshold; let go past it and
 * it spins until `onRefresh` settles, then shrinks away. Short of it, it
 * slides back and nothing happens.
 *
 * The pull is damped (half the finger's travel, easing off further down), the
 * way a rubber band is, and the page itself does not move, so nothing under
 * the finger shifts. Off during a session, with the menu open, over dialogs
 * and sliders, and while a deck is being dragged.
 */
const PHONE = "(max-width: 900px)";
const THRESHOLD = 70;     // px of (damped) pull that commits
const MAX = 120;
const SIZE = 40;

function scrolledToTop(el) {
  if ((window.scrollY || document.documentElement.scrollTop) > 0) return false;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollTop > 0) return false;
  }
  return true;
}
function blocked(target) {
  return Boolean(target?.closest?.(
    'input[type="range"], textarea, [contenteditable="true"], [role="dialog"], .shr-scrim, .app-nav, .no-swipe',
  )) || document.documentElement.classList.contains("is-deck-dragging")
    || document.body.classList.contains("is-nav-open")
    || Boolean(document.querySelector(".app-shell.is-session"));
}
const damp = d => Math.min(MAX, d < 0 ? 0 : d * 0.5 * (1 - Math.min(0.4, d / 1200)));

export default function PullToRefresh({ onRefresh }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cb = useRef(onRefresh);
  useEffect(() => { cb.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    let t = null;

    function paint(pull, animate) {
      const el = ref.current;
      if (!el) return;
      const p = Math.min(1, pull / THRESHOLD);
      el.style.transition = animate ? "transform 0.32s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease" : "none";
      el.style.transform = `translate3d(-50%, ${pull - SIZE - 8}px, 0) rotate(${pull * 3}deg) scale(${0.6 + 0.4 * p})`;
      el.style.opacity = String(Math.min(1, pull / 24));
      el.style.setProperty("--arc", String(p));
      el.classList.toggle("is-armed", p >= 1);
    }

    function onStart(e) {
      if (!mq.matches || busyRef.current || e.touches.length !== 1 || t) return;
      if (blocked(e.target) || !scrolledToTop(e.target)) return;
      t = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, locked: false, pull: 0 };
    }
    function onMove(e) {
      if (!t) return;
      const dx = e.touches[0].clientX - t.x0, dy = e.touches[0].clientY - t.y0;
      if (!t.locked) {
        if (Math.hypot(dx, dy) < 8) return;
        if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.3) { t = null; return; }
        t.locked = true;
        t.y0 = e.touches[0].clientY;
      }
      e.preventDefault();
      t.pull = damp(e.touches[0].clientY - t.y0);
      paint(t.pull, false);
    }
    async function onEnd() {
      if (!t) return;
      const s = t; t = null;
      if (!s.locked) return;
      if (s.pull < THRESHOLD) { paint(0, true); return; }
      busyRef.current = true;
      setBusy(true);
      paint(THRESHOLD, true);
      navigator.vibrate?.(8);
      const started = Date.now();
      try { await cb.current?.(); } catch { /* the caller keeps the screen as it was */ }
      /* Long enough to read as having happened, even when it was instant. */
      const rest = 600 - (Date.now() - started);
      if (rest > 0) await new Promise(r => setTimeout(r, rest));
      const el = ref.current;
      if (el) {
        el.style.transition = "transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.28s ease";
        el.style.transform = `translate3d(-50%, ${THRESHOLD - SIZE - 8}px, 0) scale(0.3)`;
        el.style.opacity = "0";
      }
      setTimeout(() => { busyRef.current = false; setBusy(false); paint(0, false); }, 300);
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div ref={ref} className={`ptr${busy ? " is-busy" : ""}`} aria-hidden={!busy} role="status" aria-label={busy ? "Refreshing" : undefined}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle className="ptr-arc" cx="11" cy="11" r="8" fill="none" strokeWidth="2.4" strokeLinecap="round" pathLength="100" />
      </svg>
    </div>
  );
}
