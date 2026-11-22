/*
 * A ready-made deck's question image, cached at Vercel's edge for good
 * (2026-11-22).
 *
 * Every device used to download every ready-made image straight from
 * Supabase through a signed link that changed each hour, so nothing in
 * between could cache it: when Year 3 brought 859 images, each student's
 * app fetched about 50 MB, and the project went over its 5 GB egress for
 * the month. Here each image is fetched from Supabase once per edge region
 * and then served from the cache; the path names a picture that never
 * changes (a new upload gets a new uuid), so it is cached as immutable,
 * by browsers too.
 *
 * Only ready-made images come through here: storage lets anon read a
 * question image only when it is in a featured deck (migration 0103),
 * the same images the public bundle already lists. Anyone's own images
 * stay behind signed links.
 */
const SUPABASE_URL = "https://uhqpljteohitvytwfadp.supabase.co";
const ANON_KEY = "sb_publishable_0ZlQhc0Gn_bD5-AFIgPOrw_xKVHv8hJ";
const PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|jpeg|png)$/i;
const MAX_BYTES = 4 * 1024 * 1024;

const none = (status, text) => new Response(text, { status, headers: { "cache-control": "no-store" } });

export async function GET(request) {
  const p = new URL(request.url).searchParams.get("p") ?? "";
  if (!PATH.test(p)) return none(400, "bad path");
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/question-images/${p}`, {
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return none(504, "upstream");
  }
  /* Not a ready-made image, or not there: storage answers 400. */
  if (!res.ok) return none(res.status === 400 || res.status === 404 ? 404 : 502, "not found");
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return none(502, "not an image");
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return none(502, "too large");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
