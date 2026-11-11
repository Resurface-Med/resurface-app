/*
 * A shared deck, looked up by its share code for link previews (2026-10-28).
 * deck_link_preview (migration 0061) answers without sign-in with the name,
 * question count and sharer's name only;
 * the URL and key are the public ones already in the app's bundle.
 */
const SUPABASE_URL = "https://uhqpljteohitvytwfadp.supabase.co";
const ANON_KEY = "sb_publishable_0ZlQhc0Gn_bD5-AFIgPOrw_xKVHv8hJ";

export async function deckByCode(code) {
  if (!/^[a-z0-9]{6,32}$/i.test(String(code || ""))) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/deck_link_preview`, {
      method: "POST",
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const d = Array.isArray(rows) ? rows[0] : rows;
    if (!d?.name) return null;
    return { name: String(d.name), questions: Number(d.questions) || 0, owner: d.owner_name ? String(d.owner_name) : null };
  } catch {
    return null;
  }
}

/* "24 questions", "1 question". */
export const countLabel = n => `${n} question${n === 1 ? "" : "s"}`;
/* First name only, as the leaderboard shows people. */
export const firstName = s => String(s || "").trim().split(/\s+/)[0] || null;

/* A friend link's sender, for its preview (migration 0080): first name only. */
export async function friendByCode(code) {
  if (!/^[a-f0-9]{10}$/.test(String(code || ""))) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/friend_link_preview`, {
      method: "POST",
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const r = Array.isArray(rows) ? rows[0] : rows;
    return r?.first_name ? String(r.first_name) : null;
  } catch {
    return null;
  }
}
