import { useEffect, useRef } from "react";

/**
 * The phone menu, moved by a finger.
 *
 * Closed, a rightward swipe that starts in the left half of the screen pulls
 * it out; open, a leftward one anywhere pushes it back. Either way it follows
 * the finger one-to-one, the scrim darkening with it, and on release it
 * carries on at the speed it was let go at: a flick commits from any
 * distance, a slow drag settles on whichever side is nearer. That last part
 * is most of what makes it feel like iOS rather than like a web page.
 *
 * Decided per touch, after the first few pixels: a mostly vertical start is a
 * scroll and is left alone entirely. Not started from sliders, text fields,
 * dialogs, a deck being dragged, or during a practice session (the menu is
 * hidden then).
 */
const PHONE = "(max-width: 900px)";
const LOCK_PX = 10;          // movement before deciding what the touch is
const FLICK = 0.35;          // px/ms that commits regardless of distance
const EASE = "cubic-bezier(0.25, 1, 0.5, 1)";

function blocked(target) {
  return Boolean(target?.closest?.(
    'input, textarea, select, [contenteditable="true"], [role="dialog"], .shr-scrim, .no-swipe',
  )) || document.documentElement.classList.contains("is-deck-dragging")
    || Boolean(document.querySelector(".app-shell.is-session"));
}

export function useDrawerSwipe({ open, setOpen, navRef, scrimRef }) {
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    let t = null;   // the touch being followed

    function paint(p, animate, ms = 300) {
      const nav = navRef.current, scrim = scrimRef.current;
      if (!nav || !scrim) return;
      const w = nav.offsetWidth;
      const tr = animate ? `transform ${ms}ms ${EASE}` : "none";
      nav.style.transition = tr;
      nav.style.transform = `translate3d(${(p - 1) * w}px, 0, 0)`;
      scrim.style.transition = animate ? `opacity ${ms}ms ${EASE}` : "none";
      scrim.style.opacity = String(p);
      scrim.style.pointerEvents = "auto";
    }
    function release() {
      const nav = navRef.current, scrim = scrimRef.current;
      for (const el of [nav, scrim]) {
        if (!el) continue;
        el.style.transition = el.style.transform = el.style.opacity = el.style.pointerEvents = "";
      }
    }

    function onStart(e) {
      if (!mq.matches || e.touches.length !== 1 || t) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      const wasOpen = openRef.current;
      if (!wasOpen && (x > window.innerWidth * 0.5 || blocked(e.target))) return;
      t = { x0: x, y0: y, wasOpen, locked: false, w: navRef.current?.offsetWidth || 300, pts: [[e.timeStamp, x]] };
    }

    function onMove(e) {
      if (!t) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      const dx = x - t.x0, dy = y - t.y0;
      if (!t.locked) {
        if (Math.hypot(dx, dy) < LOCK_PX) return;
        const sideways = Math.abs(dx) > Math.abs(dy) * 1.2;
        const right = t.wasOpen ? dx < 0 : dx > 0;
        if (!sideways || !right) { t = null; return; }   // a scroll, or the wrong way
        t.locked = true;
        t.x0 = x;                                         // no jump on lock
      }
      e.preventDefault();
      t.pts.push([e.timeStamp, x]);
      if (t.pts.length > 6) t.pts.shift();
      const p = Math.max(0, Math.min(1, (t.wasOpen ? 1 : 0) + (x - t.x0) / t.w));
      t.p = p;
      paint(p, false);
    }

    function onEnd(e) {
      if (!t) return;
      const s = t; t = null;
      if (!s.locked) return;
      /* Speed over the last stretch of the gesture, not the whole of it. */
      const now = e.timeStamp;
      const recent = s.pts.filter(([ts]) => now - ts < 100);
      const [t0, x0] = recent[0] ?? s.pts[0];
      const [t1, x1] = s.pts[s.pts.length - 1];
      const v = (x1 - x0) / Math.max(1, t1 - t0);          // px/ms, + is opening
      const p = s.p ?? (s.wasOpen ? 1 : 0);
      const toOpen = v > FLICK ? true : v < -FLICK ? false : p > 0.5;
      /* As long as the rest of the distance takes at the speed it was
         thrown, within limits — a flick finishes fast, a nudge eases in. */
      const left = Math.abs((toOpen ? 1 : 0) - p) * s.w;
      const ms = Math.round(Math.max(170, Math.min(380, Math.abs(v) > 0.05 ? (left / Math.abs(v)) * 1.6 : 320)));
      paint(toOpen ? 1 : 0, true, ms);
      setOpen(toOpen);
      const nav = navRef.current;
      const done = () => { release(); nav?.removeEventListener("transitionend", done); };
      nav?.addEventListener("transitionend", done);
      setTimeout(done, ms + 60);
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
  }, [navRef, scrimRef, setOpen]);
}
