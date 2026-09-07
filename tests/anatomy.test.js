import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadRegion, centreOf, extentOf } from "../src/lib/anatomy.js";

/* The loader is the one place a wrong offset produces a mesh that still draws,
   just as the wrong shape, so it is checked against a real bundle rather than a
   fixture. Node has no fetch for file paths and no DecompressionStream in the
   shape the browser gives, so both are stood in for here — everything after
   them is the code that actually ships. */
const asArrayBuffer = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

beforeAll(() => {
  globalThis.fetch = async url => {
    const path = `./public${url}`;
    if (url.endsWith(".json")) {
      return { ok: true, json: async () => JSON.parse(readFileSync(path, "utf8")) };
    }
    /* Served with its gzip header intact, which is the case the loader has to
       sniff for — a host that sets Content-Encoding hands over plain bytes
       instead, and that path is covered by its own test below. */
    return { ok: true, arrayBuffer: async () => asArrayBuffer(readFileSync(path)) };
  };
  globalThis.DecompressionStream = function () {};
  globalThis.Blob = class {
    constructor(parts) { this.parts = parts; }
    stream() { return { pipeThrough: () => this.parts[0] }; }
  };
  globalThis.Response = class {
    constructor(body) { this.body = body; }
    async arrayBuffer() { return asArrayBuffer(gunzipSync(this.body)); }
  };
});

describe("anatomy bundle loading", () => {
  it("reads the heart region", async () => {
    const r = await loadRegion("heart");
    expect(r.region).toBe("heart");
    /* Not a fixed count: the heart region's membership is a judgement that has
       already changed once — it gained the cardiac veins when the filter was
       found to be dropping them — and a test that pins the number just has to
       be edited every time that judgement improves. What matters is that the
       region loaded and holds the heart's own circulation, both halves. */
    expect(r.parts.length).toBeGreaterThan(60);
    expect(r.concepts.length).toBeGreaterThan(0);
    const names = r.parts.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes("coronary artery"))).toBe(true);
    expect(names.some(n => n.includes("cardiac vein"))).toBe(true);
  });

  it("decodes every part inside its own bounding box", async () => {
    const r = await loadRegion("heart");
    for (const part of r.parts) {
      const g = r.get(part.id);
      expect(g.positions.length).toBe(part.vertexCount * 3);
      expect(g.indices.length).toBe(part.indexCount);

      const [min, max] = part.bounds;
      /* Quantisation cannot put a vertex outside the box it was quantised
         against; if it does, the axes are transposed or the stride is wrong. */
      for (let i = 0; i < g.positions.length; i += 3) {
        for (let c = 0; c < 3; c++) {
          expect(g.positions[i + c]).toBeGreaterThanOrEqual(min[c] - 1e-6);
          expect(g.positions[i + c]).toBeLessThanOrEqual(max[c] + 1e-6);
        }
      }
    }
  });

  it("uses the full quantisation range, so the box is the mesh's own", async () => {
    const r = await loadRegion("heart");
    const part = r.parts.find(p => p.name === "Wall of ventricle");
    const g = r.get(part.id);
    const [min, max] = part.bounds;
    /* A part's box is its own, so some vertex should sit at each extreme. A box
       that were merely generous — the whole model's, say — would leave the mesh
       floating in the middle of it and this would fail. */
    for (let c = 0; c < 3; c++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = c; i < g.positions.length; i += 3) {
        if (g.positions[i] < lo) lo = g.positions[i];
        if (g.positions[i] > hi) hi = g.positions[i];
      }
      const span = max[c] - min[c];
      expect(Math.abs(lo - min[c])).toBeLessThan(span * 0.02);
      expect(Math.abs(hi - max[c])).toBeLessThan(span * 0.02);
    }
  });

  it("keeps every index inside its own mesh", async () => {
    const r = await loadRegion("heart");
    for (const part of r.parts) {
      const g = r.get(part.id);
      expect(g.indices.length % 3).toBe(0);
      for (const v of g.indices) expect(v).toBeLessThan(part.vertexCount);
    }
  });

  it("returns the same decoded object twice rather than redoing the work", async () => {
    const r = await loadRegion("heart");
    const id = r.parts[0].id;
    expect(r.get(id)).toBe(r.get(id));
  });

  it("takes bytes as they are when the server already decompressed them", async () => {
    /* Vite's dev server sets Content-Encoding: gzip on a .gz file, so the
       browser unwraps it before the loader sees it. Gunzipping again throws,
       which is what this guards. */
    const plain = gunzipSync(readFileSync("./public/anatomy/heart.bin.gz"));
    globalThis.fetch = async url =>
      url.endsWith(".json")
        ? { ok: true, json: async () => JSON.parse(readFileSync("./public/anatomy/heart.json", "utf8")) }
        : { ok: true, arrayBuffer: async () => asArrayBuffer(plain) };

    const r = await loadRegion("heart-plain-bytes-check");
    expect(r.parts.length).toBeGreaterThan(60);
    const g = r.get(r.parts[0].id);
    expect(g.positions.length).toBe(r.parts[0].vertexCount * 3);
  });

  it("frames a part from its box", async () => {
    const r = await loadRegion("heart");
    const part = r.parts.find(p => p.name === "Wall of ventricle");
    const c = centreOf(part);
    const [min, max] = part.bounds;
    for (let i = 0; i < 3; i++) {
      expect(c[i]).toBeGreaterThan(min[i]);
      expect(c[i]).toBeLessThan(max[i]);
    }
    expect(extentOf(part)).toBeGreaterThan(0);
  });
});
