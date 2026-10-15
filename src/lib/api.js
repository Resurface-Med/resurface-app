/**
 * Calling the backend, by whichever of its names this network lets through.
 *
 * On eduroam the app's questions load — they come from supabase.co — but
 * generating and Resurface AI did not, because both go to
 * api.tryresurface.com, a domain young enough that campus web filters tend to
 * hold it as unrated and block it. The same backend also answers at its
 * Vercel name, on a domain filters have rated for years. So: ask the first
 * name; if it cannot be reached at all, use the next, and remember which one
 * worked for the rest of the visit.
 *
 * "Cannot be reached" is decided by a small probe with a short timeout, not
 * by the real request: a filter that silently drops traffic would otherwise
 * hold a generation open for minutes before failing. An HTTP error from the
 * backend (401, 429, 500) is an answer, and is never retried elsewhere.
 */

const PRIMARY = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "" : "https://api.tryresurface.com");

/* The backend project's own Vercel name. Same deployment, same code. */
const FALLBACK = "https://resurface-backend-orpin.vercel.app";

export const API_BASES = PRIMARY === "" ? [""] : [PRIMARY, FALLBACK];

const PROBE_MS = 4000;

/* Any reply at all, opaque or not, means the host is reachable. HEAD on the
   generate route is answered by the router (405) without running anything. */
export async function reachable(base, fetchImpl = fetch, ms = PROBE_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    await fetchImpl(`${base}/api/generate`, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** A client over a list of names for the same backend, in order of preference. */
export function createApi(bases, fetchImpl = (...a) => fetch(...a)) {
  let chosen = null;          // a base known to answer, once one has

  async function pickBase() {
    if (chosen !== null) return chosen;
    for (const base of bases) {
      if (bases.length === 1 || await reachable(base, fetchImpl)) { chosen = base; return base; }
    }
    return bases[0];          // nothing answered: try the first, and report its error
  }

  /**
   * fetch() against the backend. `path` starts with /api/. If the request
   * itself fails at the network level on one name — a filter that lets the
   * probe through but blocks the real call — the next name is tried once.
   */
  async function apiFetch(path, init = {}) {
    const first = await pickBase();
    try {
      return await fetchImpl(`${first}${path}`, init);
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      for (const base of bases.filter(b => b !== first)) {
        try {
          const res = await fetchImpl(`${base}${path}`, init);
          chosen = base;
          return res;
        } catch (e2) {
          if (e2?.name === "AbortError") throw e2;
        }
      }
      chosen = null;          // nothing worked; probe again next time
      const err = new Error("Couldn't reach Resurface's server from this network. If you're on campus wifi, try mobile data.");
      err.network = true;
      throw err;
    }
  }
  return apiFetch;
}

export const apiFetch = createApi(API_BASES);
