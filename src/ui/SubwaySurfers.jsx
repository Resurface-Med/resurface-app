import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "../lib/online";

/**
 * Gameplay beside the question (2026-10-20). An inside joke, hidden:
 * nothing in the app points to it.
 *
 * During a session —
 *   Subway Surfers, on the left: type "sub", or tap the question counter
 *     three times quickly on a phone.
 *   Minecraft parkour, on the right: type "mc", or tap the progress bar
 *     three times quickly.
 * The same again, or a video's ×, puts it away. Remembered on this device.
 * On a phone, where there are no margins, they share a strip across the
 * bottom — the split screen the joke is about.
 *
 * Both are YouTube embeds (no-cookie player), muted and looping: Subway
 * Surfers from the game's official channel, Minecraft parkour from a channel
 * that publishes free-to-use gameplay. Nothing shows offline. (The Subway
 * code was the Konami code; too long.)
 */
const embed = id => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3`;
export const VIDEOS = {
  subway:  { id: "QPW3XwBoQlw", code: ["s", "u", "b"], key: "resurface_subway",  title: "Subway Surfers" },
  parkour: { id: "-lVgihPljuI", code: ["m", "c"],      key: "resurface_parkour", title: "Minecraft parkour" },
};

function read(key) { try { return localStorage.getItem(key) === "1"; } catch { return false; } }
function write(key, on) { try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch { /* storage off */ } }

/* Three taps, each within 500ms of the last. */
function useTriple(fire) {
  const r = useRef({ n: 0, t: 0 });
  return () => {
    const now = Date.now();
    r.current.n = now - r.current.t < 500 ? r.current.n + 1 : 1;
    r.current.t = now;
    if (r.current.n >= 3) { r.current.n = 0; fire(); }
  };
}

/* Which are on, and the ways of switching them: the typed codes (listened
   for here), and taps for the counter and the progress bar. */
export function useSideVideos() {
  const [on, setOn] = useState(() => ({ subway: read(VIDEOS.subway.key), parkour: read(VIDEOS.parkour.key) }));
  const set = useCallback((name, value) => setOn(prev => {
    const v = typeof value === "function" ? value(prev[name]) : value;
    write(VIDEOS[name].key, v);
    return { ...prev, [name]: v };
  }), []);
  const toggle = useCallback(name => set(name, v => !v), [set]);

  useEffect(() => {
    const at = { subway: 0, parkour: 0 };
    const onKey = e => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable=true]")) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      for (const [name, { code }] of Object.entries(VIDEOS)) {
        if (k === code[at[name]]) {
          at[name] += 1;
          if (at[name] === code.length) { at[name] = 0; toggle(name); }
        } else {
          at[name] = k === code[0] ? 1 : 0;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return {
    ...on,
    tapCounter: useTriple(() => toggle("subway")),
    tapBar: useTriple(() => toggle("parkour")),
    close: name => set(name, false),
  };
}

function Video({ name, side, onClose }) {
  const v = VIDEOS[name];
  return (
    <div className={`subway is-${side} is-${name}`} role="complementary" aria-label={v.title}>
      <iframe
        className="subway__video"
        src={embed(v.id)}
        title={`${v.title} gameplay`}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
      />
      <button type="button" className="subway__x" onClick={() => onClose(name)} aria-label={`Hide ${v.title}`}>
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

/* Subway on the left (on the right while the question list fills the left
   and Minecraft is off); Minecraft on the right, stepping aside while the AI
   panel is open there. */
export default function SideVideos({ videos, railOpen = false, aiOpen = false }) {
  const online = useOnline();
  if (!online) return null;
  const parkour = videos.parkour && !aiOpen;
  const subway = videos.subway;
  if (!subway && !parkour) return null;
  return (
    <div className={`subway-strip${subway && parkour ? " is-both" : ""}`}>
      {subway && <Video name="subway" side={railOpen && !parkour ? "right" : "left"} onClose={videos.close} />}
      {parkour && <Video name="parkour" side="right" onClose={videos.close} />}
    </div>
  );
}
