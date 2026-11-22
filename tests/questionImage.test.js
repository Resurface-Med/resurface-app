import { describe, expect, it, vi, beforeEach } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const kept = new Map();
const signs = [];

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: ME } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: () => ({ createSignedUrl: async path => { signs.push(path); return { data: { signedUrl: `https://signed/${path}` }, error: null }; } }) },
  },
}));
vi.mock("../src/lib/offlineStore", () => ({
  readImage: async p => kept.get(p) ?? null,
  hasImage: async p => kept.has(p),
  saveImage: async (p, b) => { kept.set(p, b); return true; },
  deleteImage: async p => { kept.delete(p); },
}));

const img = () => new Blob(["x"], { type: "image/webp" });
/* The edge serves ready-made images; anything else it refuses with 404. */
const shared = new Set();
const fetched = [];
globalThis.fetch = vi.fn(async url => {
  fetched.push(String(url));
  const u = String(url);
  if (u.startsWith("/api/qimg?p=")) {
    const p = decodeURIComponent(u.slice("/api/qimg?p=".length));
    return shared.has(p) ? new Response(img(), { status: 200 }) : new Response("no", { status: 404 });
  }
  if (u.startsWith("https://signed/") || u.startsWith("/qimg/")) return new Response(img(), { status: 200 });
  return new Response("no", { status: 404 });
});
globalThis.URL.createObjectURL = () => "blob:local";

const { questionImageUrl, keepImagesOffline } = await import("../src/lib/questionImage");

beforeEach(() => { kept.clear(); signs.length = 0; fetched.length = 0; shared.clear(); });

describe("question images", () => {
  it("a ready-made image comes from the edge, never a signed link, even when it is the owner's", async () => {
    const p = `${ME}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    shared.add(p);
    expect(await questionImageUrl(p)).toBe("blob:local");
    expect(signs).toEqual([]);
    expect(fetched).toEqual([`/api/qimg?p=${encodeURIComponent(p)}`]);
    expect(kept.has(p)).toBe(true);
  });
  it("your own private image falls back to a signed link", async () => {
    const p = `${ME}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
    expect(await questionImageUrl(p)).toBe("blob:local");
    expect(signs).toEqual([p]);
  });
  it("someone else's image the edge refuses is not signed for", async () => {
    const p = `${OTHER}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp`;
    expect(await questionImageUrl(p)).toBeNull();
    expect(signs).toEqual([]);
  });
  it("downloads once: the picture is drawn from the copy it keeps", async () => {
    const p = `${OTHER}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp`;
    shared.add(p);
    await questionImageUrl(p);
    await questionImageUrl(p);
    expect(fetched.filter(u => u.includes("dddddddd"))).toHaveLength(1);
  });
  it("keeping images skips what is already on the device", async () => {
    const a = `${OTHER}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp`;
    const b = `${OTHER}/ffffffff-ffff-4fff-8fff-ffffffffffff.webp`;
    shared.add(a); shared.add(b);
    kept.set(a, img());
    await keepImagesOffline([a, b]);
    expect(fetched).toEqual([`/api/qimg?p=${encodeURIComponent(b)}`]);
    expect(kept.has(b)).toBe(true);
  });
});
