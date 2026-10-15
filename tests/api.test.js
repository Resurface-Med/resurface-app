import { describe, it, expect } from "vitest";
import { createApi } from "../src/lib/api.js";

const PRIMARY = "https://api.tryresurface.com", FALLBACK = "https://resurface-backend-orpin.vercel.app";
const API_BASES = [PRIMARY, FALLBACK];
/* A network where some hosts are blocked: a blocked host throws, as fetch does. */
function network({ blocked = [], probeOnly = [], status = 200 } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    const host = API_BASES.find(b => url.startsWith(b));
    if (blocked.includes(host)) throw new TypeError("Failed to fetch");
    if (probeOnly.includes(host) && init.method !== "HEAD") throw new TypeError("Failed to fetch");
    return { ok: status < 400, status, host };
  };
  return { f, calls };
}

describe("apiFetch", () => {
  it("uses the main name when it answers, and probes only once", async () => {
    const n = network();
    const apiFetch = createApi(API_BASES, n.f);
    expect((await apiFetch("/api/generate", { method: "POST" })).host).toBe(PRIMARY);
    await apiFetch("/api/explain", { method: "POST" });
    expect(n.calls.filter(c => c.startsWith("HEAD"))).toHaveLength(1);
  });

  it("falls back when the main name is blocked (eduroam)", async () => {
    const n = network({ blocked: [PRIMARY] });
    const apiFetch = createApi(API_BASES, n.f);
    expect((await apiFetch("/api/generate", { method: "POST" })).host).toBe(FALLBACK);
    expect((await apiFetch("/api/explain", { method: "POST" })).host).toBe(FALLBACK);
  });

  it("falls back when the probe gets through but the real call is blocked", async () => {
    const n = network({ probeOnly: [PRIMARY] });
    const apiFetch = createApi(API_BASES, n.f);
    expect((await apiFetch("/api/generate", { method: "POST" })).host).toBe(FALLBACK);
  });

  it("never fails over on an answer from the backend, even an error", async () => {
    const n = network({ status: 429 });
    const res = await createApi(API_BASES, n.f)("/api/generate", { method: "POST" });
    expect(res.status).toBe(429);
    expect(res.host).toBe(PRIMARY);
  });

  it("says plainly when nothing can be reached", async () => {
    const n = network({ blocked: [PRIMARY, FALLBACK] });
    await expect(createApi(API_BASES, n.f)("/api/generate", { method: "POST" })).rejects.toThrow(/campus wifi/);
  });

  it("lets a cancel through untouched", async () => {
    const f = async (url, init) => { if (init.method === "HEAD") return {}; const e = new Error("x"); e.name = "AbortError"; throw e; };
    await expect(createApi(API_BASES, f)("/api/generate", { method: "POST" })).rejects.toMatchObject({ name: "AbortError" });
  });
});
