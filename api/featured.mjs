/*
 * The featured decks, cached at Vercel's edge by version (2026-10-29).
 *
 * featured_bundle (migration 0062) is the same for everyone, so a version
 * of it only needs building once: /api/featured?v=12 is cached for a year
 * at the edge, and the version number in the URL changes whenever the
 * content does. The app asks featured_version first (a few bytes) and only
 * comes here when its own copy is out of date.
 *
 * Compressed here rather than left to the edge: the response body limit is
 * 4.5 MB and the bundle is over 3 MB of JSON.
 */
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const SUPABASE_URL = "https://uhqpljteohitvytwfadp.supabase.co";
const ANON_KEY = "sb_publishable_0ZlQhc0Gn_bD5-AFIgPOrw_xKVHv8hJ";

export async function GET(request) {
  const url = new URL(request.url);
  const want = url.searchParams.get("v");
  let text;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/featured_bundle`, {
      method: "POST",
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return new Response("upstream", { status: 502, headers: { "cache-control": "no-store" } });
    text = await res.text();
  } catch {
    return new Response("upstream", { status: 504, headers: { "cache-control": "no-store" } });
  }

  /* Only cache for good when the content really is the version asked for:
     a request for a version that does not exist yet must not pin today's
     content under tomorrow's number. */
  const got = /"version":\s*(\d+)/.exec(text)?.[1];
  const exact = want != null && got === want;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": exact ? "public, max-age=31536000, immutable" : "no-store",
    "x-featured-version": got ?? "",
    vary: "accept-encoding",
  };

  const accept = request.headers.get("accept-encoding") || "";
  let body = text;
  if (/\bbr\b/.test(accept)) {
    body = brotliCompressSync(Buffer.from(text), { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } });
    headers["content-encoding"] = "br";
  } else if (/\bgzip\b/.test(accept)) {
    body = gzipSync(Buffer.from(text), { level: 9 });
    headers["content-encoding"] = "gzip";
  }
  return new Response(body, { status: 200, headers });
}
