import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The launch film, as the first thing a new account sees.
 *
 * Rendered out of resurface-film, frames 228–1323 of the 1466: from the
 * wave rising out of the dark to the progress shot — not the opening count,
 * and not the "Sign up for free" end card, which is wrong for someone signed
 * in. 36.5 seconds, 16:9 for wide screens and 9:16 for tall ones. When it ends the one
 * action the film has been leading up to takes its place.
 *
 * Muted, so browsers allow it to start on its own — the film has no sound.
 * With reduced motion asked for, it waits on the poster to be played.
 */
const tall = () => typeof window !== "undefined" && window.matchMedia("(max-aspect-ratio: 1/1)").matches;
/* 1080p unless the browser says to save data or the connection is slow. A
   browser that does not report its connection (Safari, Firefox) gets 1080p:
   at 720p the film's type went soft on a laptop screen. */
const quality = () => {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  if (c?.saveData) return "720";
  if (c && /(^|-)2g$|^3g$/.test(c.effectiveType || "")) return "720";
  return "1080";
};
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function IntroFilm({ onClose, onStart }) {
  const [shape] = useState(() => (tall() ? "9x16" : "16x9"));
  const [q] = useState(quality);
  const [ended, setEnded] = useState(false);
  const [progress, setProgress] = useState(0);
  const video = useRef(null);
  const root = useRef(null);

  useEffect(() => {
    /* The dialog takes focus, not the close button: Esc and Tab work at
       once, without a focus ring sitting on the × before anyone has used
       the keyboard. */
    root.current?.focus();
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    const v = video.current;
    if (!v || reduced()) return;
    v.play().catch(() => { /* blocked: the poster and its play button stay */ });
  }, []);

  function again() {
    const v = video.current;
    if (!v) return;
    setEnded(false);
    v.currentTime = 0;
    v.play().catch(() => {});
  }

  return createPortal(
    <div ref={root} tabIndex={-1} className="intro-film" role="dialog" aria-modal="true" aria-label="What Resurface does"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`intro-film__stage is-${shape}${ended ? " is-ended" : ""}`}>
        <video
          ref={video}
          className="intro-film__video"
          src={`/intro/resurface-${shape}-${q}.mp4`}
          poster={`/intro/poster-${shape}.jpg`}
          muted
          playsInline
          preload="auto"
          controls={false}
          onClick={() => { const v = video.current; if (v) (v.paused ? v.play() : v.pause()); }}
          onTimeUpdate={e => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          onEnded={() => setEnded(true)}
        />
        <div className="intro-film__bar" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></div>

        {ended && (
          <div className="intro-film__end">
            <button type="button" className="intro-film__cta btn-press" onClick={onStart}>
              Turn your content into questions <span aria-hidden="true">→</span>
            </button>
            <button type="button" className="intro-film__again" onClick={again}>Watch again</button>
          </div>
        )}

        <button type="button" className="intro-film__close" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
