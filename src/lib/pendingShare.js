/**
 * A shared deck link, kept until it has been dealt with (2026-10-20).
 *
 * The code used to live only in memory: read from /d/<code> as the app
 * opened, the address cleared, and the code held in React state. Anything
 * that reloads the page before the receive screen loses it — and signing in
 * does exactly that. Google sign-in leaves the site and comes back to the
 * home address; confirming an email sign-up from the link in the email opens
 * a new tab. Either way a friend's link dropped them on an empty Home with no
 * deck, on the one route that brings in most of the people who stay.
 *
 * So the code is also written to this browser's storage (localStorage, not
 * sessionStorage: the confirmation link opens a new tab) and read back on the
 * next load. It is cleared once the receive screen has been answered —
 * added, or "Go to my decks" — and it lapses after three days, so a link
 * opened and abandoned does not ambush whoever signs in next week. Nothing
 * is added without the receive screen asking first, so a stale code can only
 * ever show that screen, never copy a deck.
 *
 * Pure apart from storage, which may be refused (private windows): then it
 * behaves as before.
 */
const KEY = "pq_pending_share";
export const PENDING_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const CODE = /^[a-f0-9]{12}$/;

export function rememberShare(code, now = Date.now(), store = globalThis.localStorage) {
  if (!code || !CODE.test(code)) return;
  try { store?.setItem(KEY, JSON.stringify({ code, at: now })); } catch { /* storage refused */ }
}

export function pendingShare(now = Date.now(), store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw);
    if (!CODE.test(code ?? "") || !(now - at >= 0 && now - at < PENDING_MAX_AGE)) {
      store.removeItem(KEY);
      return null;
    }
    return code;
  } catch { return null; }
}

export function forgetShare(store = globalThis.localStorage) {
  try { store?.removeItem(KEY); } catch { /* storage refused */ }
}
