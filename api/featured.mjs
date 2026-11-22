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
 *
 * One piece (2026-11-22, migration 0099): /api/featured?root=<id>&h=<hash>
 * is that root's shard, cached for good when its hash is the one asked
 * for. The app fetches only the pieces whose hash it does not already have.
 */
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const SUPABASE_URL = "https://uhqpljteohitvytwfadp.supabase.co";
const ANON_KEY = "sb_publishable_0ZlQhc0Gn_bD5-AFIgPOrw_xKVHv8hJ";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function upstream(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw Object.assign(new Error("upstream"), { status: 502 });
  return res.text();
}

function compressed(request, text, headers) {
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

const failed = e => new Response("upstream", { status: e?.status ?? 504, headers: { "cache-control": "no-store" } });

export async function GET(request) {
  const url = new URL(request.url);
  const root = url.searchParams.get("root");
  if (root != null) {
    if (!UUID.test(root)) return new Response("bad root", { status: 400, headers: { "cache-control": "no-store" } });
    const wantHash = url.searchParams.get("h");
    let text;
    try { text = await upstream("featured_shard", { root }); } catch (e) { return failed(e); }
    if (text === "null") return new Response("not listed", { status: 404, headers: { "cache-control": "no-store" } });
    let got = null;
    try { got = JSON.parse(text)?.hash ?? null; } catch { /* not JSON: not cached */ }
    return compressed(request, text, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": wantHash && got === wantHash ? "public, max-age=31536000, immutable" : "no-store",
      "x-featured-hash": got ?? "",
      vary: "accept-encoding",
    });
  }

  const want = url.searchParams.get("v");
  let text;
  try { text = await upstream("featured_bundle", {}); } catch (e) { return failed(e); }

  /* Only cache for good when the content really is the version asked for:
     a request for a version that does not exist yet must not pin today's
     content under tomorrow's number. */
  const got = /"version":\s*(\d+)/.exec(text)?.[1];
  const exact = want != null && got === want;
  return compressed(request, text, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": exact ? "public, max-age=31536000, immutable" : "no-store",
    "x-featured-version": got ?? "",
    vary: "accept-encoding",
  });
}
