import { supabase } from "./supabase";

/**
 * Where the time goes behind "Loading your progress…".
 *
 * It is sometimes slow and the database is not why — every load query runs
 * in under 10ms there — so each sign-in load notes when each step finished,
 * in ms since the tab started loading (performance.now()), and sends one row
 * to `load_timings` once the app is on screen. Timings and the kind of device
 * only. Read with SQL; see supabase/migrations/0009_load_timings.sql.
 *
 * Steps: script (the app's code has run), auth (session known; `refreshed`
 * says whether the stored token had expired and was renewed first), flush,
 * one per table, decks, data (all of it), shown (first screen drawn).
 */
const marks = {};
const flags = {};
let sent = false;

export function mark(name) {
  if (marks[name] == null) marks[name] = Math.round(performance.now());
}
export function flag(name, value) { flags[name] = value; }
export function timed(name, promise) {
  return promise.then(r => { mark(name); return r; });
}

/** Whether the token in storage had already expired when the app opened. */
export function tokenWasExpired() {
  try {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const exp = key && JSON.parse(localStorage.getItem(key))?.expires_at;
    return exp ? exp * 1000 < Date.now() : null;
  } catch { return null; }
}

/** Once per page, after the first screen is up. Never throws, never waits. */
export function report() {
  if (sent || !supabase) return;
  sent = true;
  mark("shown");
  const phases = { ...marks, ...flags };
  console.info("[load]", phases);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  supabase.from("load_timings").insert({
    total_ms: marks.shown,
    phases,
    standalone: Boolean(standalone),
    phone: window.matchMedia?.("(max-width: 900px)").matches ?? null,
    online_type: navigator.connection?.effectiveType ?? null,
  }).then(() => {}, () => {});
}
