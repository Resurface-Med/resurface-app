/**
 * A referral link (/r/<code> or ?r=, migration 0096), kept until claimed
 * (2026-11-23). Same reason as lib/friendLink: signing in reloads the page
 * (Google comes back to the home address), so a link opened while signed
 * out would be lost on the way in. Lapses after seven days.
 */
const KEY = "rs_pending_referral";
const CODE = /^[a-f0-9]{10}$/;
export const REFERRAL_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function referralCodeFromPath(pathname) {
  const m = String(pathname || "").match(/^\/r\/([a-f0-9]{10})\/?$/);
  return m ? m[1] : null;
}

export function referralCodeFromSearch(search) {
  try {
    const r = new URLSearchParams(search || "").get("r");
    return CODE.test(r || "") ? r : null;
  } catch {
    return null;
  }
}

export function referralUrl(code, origin = window.location.origin) {
  return `${origin}/r/${code}`;
}

export function rememberReferral(code, now = Date.now(), store = globalThis.localStorage) {
  if (!CODE.test(code || "")) return;
  try { store?.setItem(KEY, JSON.stringify({ code, at: now })); } catch { /* storage refused */ }
}

export function pendingReferral(now = Date.now(), store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw);
    if (!CODE.test(code ?? "") || !(now - at >= 0 && now - at < REFERRAL_MAX_AGE)) {
      store.removeItem(KEY);
      return null;
    }
    return code;
  } catch { return null; }
}

export function forgetReferral(store = globalThis.localStorage) {
  try { store?.removeItem(KEY); } catch { /* storage refused */ }
}
