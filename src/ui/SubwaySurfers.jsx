import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "../lib/online";

/**
 * Subway Surfers beside the question (2026-10-20). An inside joke, hidden:
 * nothing in the app points to it.
 *
 * On a keyboard, the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) during a session; on
 * a phone, the question counter tapped five times in quick succession. The
 * same again, or the ×, puts it away. Remembered on this device only.
 *
 * The footage is the game's own: the official Subway Surfers channel's
 * vertical gameplay video, embedded with YouTube's player (no-cookie), muted
 * and looping. It is the player YouTube offers for this, not a copy of the
 * video. Nothing shows offline.
 */
const VIDEO = "QPW3XwBoQlw";
const SRC = `https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1&mute=1&loop=1&playlist=${VIDEO}&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3`;
const KEY = "resurface_subway";
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

function read() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
function write(on) { try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage off */ } }

/* On or off, and the two ways of switching it: the keyboard code (listened
   for here) and `tap`, for the counter's onClick. */
export function useSubway() {
  const [on, setOn] = useState(read);
  const toggle = useCallback(() => setOn(v => { write(!v); return !v; }), []);

  useEffect(() => {
    let at = 0;
    const onKey = e => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable=true]")) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === KONAMI[at]) {
        at += 1;
        if (at === KONAMI.length) { at = 0; toggle(); }
      } else {
        at = k === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  /* Five taps, each within 600ms of the last. */
  const taps = useRef({ n: 0, t: 0 });
  const tap = () => {
    const now = Date.now();
    const r = taps.current;
    r.n = now - r.t < 600 ? r.n + 1 : 1;
    r.t = now;
    if (r.n >= 5) { r.n = 0; toggle(); }
  };

  return { on, tap, close: () => { write(false); setOn(false); } };
}

export default function SubwaySurfers({ onClose, side = "left" }) {
  const online = useOnline();
  if (!online) return null;
  return (
    <div className={`subway is-${side}`} role="complementary" aria-label="Subway Surfers">
      <iframe
        className="subway__video"
        src={SRC}
        title="Subway Surfers gameplay"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
      />
      <button type="button" className="subway__x" onClick={onClose} aria-label="Hide Subway Surfers">
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
