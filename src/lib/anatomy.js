/**
 * Loading the anatomy bundles built by scripts/build-anatomy-bundle.mjs.
 *
 * A bundle is one gzipped binary plus a manifest. The binary holds, per part
 * and back to back, positions as uint16 x3 and indices as uint16 — no normals,
 * because int16 normals are noise and cost 2MB a region to ship; they are
 * recomputed from the triangles here instead.
 *
 * Positions are quantised across each part's own bounding box, so decoding one
 * needs that box: p = min + (q / 65535) * (max - min). The build verifies this
 * round-trips to under three microns, which is four orders of magnitude below
 * anything the source MRI resolved.
 *
 * Kept free of three.js on purpose. This module turns bytes into plain typed
 * arrays; the view turns those into geometry. That way a bundle can be read
 * for its names and boxes — to write a question, say — without pulling a
 * renderer into the chunk.
 */

const BASE = "/anatomy";

/* Bundles are immutable per deploy and a region is opened repeatedly — every
   question on the heart wants the same file — so a resolved one is kept. The
   promise is cached rather than the result, so two overlapping loads share a
   single fetch instead of racing. */
const cache = new Map();

/** Region names that exist. Kept here so a caller can offer them. */
export const REGIONS = ["heart", "thorax", "abdomen"];

/* Gzip's first two bytes. Checked rather than assumed, because whether the
   bytes arrive compressed is not this code's decision to make.

   The file is stored gzipped rather than left to the host to compress: Vercel
   does not compress application/octet-stream, and a 4MB bundle arriving raw is
   the whole saving lost. But a server seeing a .gz extension may set
   Content-Encoding: gzip, in which case the browser has already unwrapped it
   before we see a byte — Vite's dev server does exactly this. Gunzipping that
   a second time throws. So look at what actually arrived. */
const GZIP_MAGIC = [0x1f, 0x8b];

async function inflate(res) {
  const raw = new Uint8Array(await res.arrayBuffer());
  if (raw[0] !== GZIP_MAGIC[0] || raw[1] !== GZIP_MAGIC[1]) return raw;

  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot decompress the anatomy model.");
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Fetches one region.
 *
 * Resolves to { region, parts, concepts, get(id) }, where get returns
 * { positions: Float32Array, indices: Uint16Array } decoded on demand — a
 * region is up to 825 meshes and a screen rarely draws them all, so decoding
 * every part up front would be work thrown away.
 */
export function loadRegion(region, { signal } = {}) {
  if (cache.has(region)) return cache.get(region);

  const p = (async () => {
    const [manifest, bin] = await Promise.all([
      fetch(`${BASE}/${region}.json`, { signal }).then(r => {
        if (!r.ok) throw new Error(`No anatomy region "${region}".`);
        return r.json();
      }),
      fetch(`${BASE}/${region}.bin.gz`, { signal }).then(r => {
        if (!r.ok) throw new Error(`Could not load the ${region} model.`);
        return inflate(r);
      }),
    ]);

    const byId = new Map(manifest.parts.map(part => [part.id, part]));

    /* Concept per mesh, narrowest first. A mesh sits under several at once,
       from "leaflet of mitral valve" up to "body cavity content"; the broad
       ones are true of half the bundle and say nothing about the part in hand,
       so the smallest wins. Sorting descending and letting later writes
       overwrite leaves the narrowest in place. */
    const conceptOf = new Map();
    for (const c of [...manifest.concepts].sort((a, b) => b.elements.length - a.elements.length)) {
      for (const e of c.elements) conceptOf.set(e, c.name);
    }
    const decoded = new Map();

    function get(id) {
      if (decoded.has(id)) return decoded.get(id);
      const part = byId.get(id);
      if (!part) return null;

      const vertBytes = part.vertexCount * 6;
      const q = new Uint16Array(bin.buffer, bin.byteOffset + part.offset, part.vertexCount * 3);
      const indices = new Uint16Array(
        bin.buffer, bin.byteOffset + part.offset + vertBytes, part.indexCount,
      );

      const [min, max] = part.bounds;
      const sx = (max[0] - min[0]) / 65535;
      const sy = (max[1] - min[1]) / 65535;
      const sz = (max[2] - min[2]) / 65535;

      const positions = new Float32Array(part.vertexCount * 3);
      for (let i = 0; i < part.vertexCount; i++) {
        positions[i * 3]     = min[0] + q[i * 3]     * sx;
        positions[i * 3 + 1] = min[1] + q[i * 3 + 1] * sy;
        positions[i * 3 + 2] = min[2] + q[i * 3 + 2] * sz;
      }

      /* Copied, not viewed. The indices sit inside the one big buffer at an
         offset three.js is free to keep a reference to for the life of the
         scene, and a view would pin the whole bundle behind one mesh. */
      const out = { positions, indices: Uint16Array.from(indices) };
      decoded.set(id, out);
      return out;
    }

    return { region, parts: manifest.parts, concepts: manifest.concepts, byId, conceptOf, get };
  })();

  cache.set(region, p);
  /* A failed load must not be remembered as the answer — the next attempt
     should try the network again rather than replay the error forever. */
  p.catch(() => cache.delete(region));
  return p;
}

/** Centre of a part's box, which is what a camera should look at. */
export function centreOf(part) {
  const [min, max] = part.bounds;
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

/** Longest edge of a part's box, which is what a camera should frame. */
export function extentOf(part) {
  const [min, max] = part.bounds;
  return Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}
