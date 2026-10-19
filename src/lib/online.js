import { useSyncExternalStore } from "react";

/**
 * Whether the app can reach Resurface right now (2026-10-19, offline).
 *
 * Not just navigator.onLine, which only knows whether there is a network at
 * all — a phone on a train has one and gets nothing through it, and campus
 * wifi can hand out an address and block us. App.jsx sets this from what
 * actually happens: a load from the server that worked is online; one that
 * failed or timed out is offline, and so is the browser saying it has no
 * network. Anything that needs the server reads it to say "Needs a
 * connection" instead of failing.
 */
let online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
const subs = new Set();

export function setOnline(v) {
  if (online === v) return;
  online = v;
  subs.forEach(fn => fn());
}

export function isOnline() { return online; }

export function useOnline() {
  return useSyncExternalStore(
    fn => { subs.add(fn); return () => subs.delete(fn); },
    () => online,
    () => true,
  );
}

/*
 * Can Supabase be reached at all? A tiny request that answers in a moment
 * either way — unlike a real load, which waits behind a token refresh and
 * the client's own retries, and so took up to fifteen seconds to admit it
 * was offline. Any answer from the server counts — no-cors, so an error
 * status or a missing CORS header still reads as reachable: it is the
 * network being asked about, not the request.
 */
export async function probe(base, ms = 4000) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    await fetch(`${base}/auth/v1/health`, { method: "GET", mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch { return false; }
  finally { clearTimeout(t); }
}
