/**
 * A friend link (/f/<code>, migration 0080), kept until it has been used
 * (2026-11-11). The same reason as lib/pendingShare: signing in reloads the
 * page (Google comes back to the home address, the email code can open a
 * new tab), so a link opened while signed out would be lost on the way in.
 * Lapses after three days, so an abandoned link does not add a friend for
 * whoever signs in next week.
 */
const KEY = "rs_pending_friend";
const CODE = /^[a-f0-9]{10}$/;
export const FRIEND_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

export function friendCodeFromPath(pathname) {
  const m = String(pathname || "").match(/^\/f\/([a-f0-9]{10})\/?$/);
  return m ? m[1] : null;
}

export function friendUrl(code, origin = window.location.origin) {
  return `${origin}/f/${code}`;
}

export function rememberFriend(code, now = Date.now(), store = globalThis.localStorage) {
  if (!CODE.test(code || "")) return;
  try { store?.setItem(KEY, JSON.stringify({ code, at: now })); } catch { /* storage refused */ }
}

export function pendingFriend(now = Date.now(), store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw);
    if (!CODE.test(code ?? "") || !(now - at >= 0 && now - at < FRIEND_MAX_AGE)) {
      store.removeItem(KEY);
      return null;
    }
    return code;
  } catch { return null; }
}

export function forgetFriend(store = globalThis.localStorage) {
  try { store?.removeItem(KEY); } catch { /* storage refused */ }
}
