import { adminEditFeatured } from "./remote";

/**
 * Admins edit the Resurface (featured) decks' questions in place
 * (2026-10-19, migration 0021). Everyone else sees them read-only, with
 * Report instead of Edit. Set once, when the app learns whether you are an
 * admin — before any question is on screen — so a plain module value will
 * do; the database checks again on every write regardless.
 */
let admin = false;
export function setFeaturedAdmin(v) { admin = Boolean(v); }
export function isFeaturedAdmin() { return admin; }

/** Whether this question can be edited by whoever is signed in. */
export function canEdit(q) { return !q?.featured || admin; }

/** How an edit to this question is saved: a featured one goes back into the
    deck itself (for everyone); null means the usual personal correction. */
export function persistFor(q) {
  return q?.featured ? updated => adminEditFeatured(q.id, updated) : null;
}
