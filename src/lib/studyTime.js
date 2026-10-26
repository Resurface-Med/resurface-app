import { useEffect, useRef } from "react";

/**
 * Time studied (2026-10-26). The clock runs while a question is on screen.
 * A hidden tab does not count, and neither does a question left sitting:
 * after a few minutes with no tap or key, the count stops until they come
 * back. A laptop asleep on the question therefore adds at most that wait,
 * not the whole gap.
 */
export const STUDY_IDLE_MS = 3 * 60 * 1000;

/** Milliseconds of one slice that count. `idleMs` is how long it has already
 *  been since the last tap or key, at the start of the slice. */
export function studySliceMs(elapsedMs, idleMs, idleLimit = STUDY_IDLE_MS) {
  if (elapsedMs <= 0 || idleMs >= idleLimit) return 0;
  return Math.min(elapsedMs, idleLimit - idleMs);
}

/** "46m", "2h", "2h 14m". The nearest minute. */
export function formatStudyTime(seconds) {
  const mins = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Adds up foreground time and hands it over in whole seconds. `active` is
 * a question being on screen. The callback gets a small delta, not a total,
 * so the caller can add it to whatever they already had.
 */
export function useStudyClock(active, onSeconds) {
  const onSecondsRef = useRef(onSeconds);
  useEffect(() => {
    onSecondsRef.current = onSeconds;
  }, [onSeconds]);

  useEffect(() => {
    if (!active) return;
    let acc = 0;
    let last = performance.now();
    let idle = 0;
    let running = document.visibilityState === "visible";

    const flush = () => {
      const n = Math.floor(acc);
      if (n < 1) return;
      acc -= n;
      onSecondsRef.current?.(n);
    };
    const step = (now) => {
      const elapsed = now - last;
      last = now;
      if (!running || elapsed <= 0) return;
      acc += studySliceMs(elapsed, idle) / 1000;
      idle = Math.min(STUDY_IDLE_MS, idle + elapsed);
      if (acc >= 15) flush();
    };
    const bump = () => { idle = 0; };
    const onVis = () => {
      step(performance.now());
      running = document.visibilityState === "visible";
      if (!running) {
        idle = 0;
        flush();
      }
    };
    const onHide = () => {
      step(performance.now());
      running = false;
      flush();
    };

    const id = setInterval(() => step(performance.now()), 1000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pointerdown", bump, true);
    window.addEventListener("keydown", bump, true);
    window.addEventListener("wheel", bump, true);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pointerdown", bump, true);
      window.removeEventListener("keydown", bump, true);
      window.removeEventListener("wheel", bump, true);
      step(performance.now());
      flush();
    };
  }, [active]);
}
