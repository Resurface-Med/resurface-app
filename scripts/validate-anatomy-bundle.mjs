#!/usr/bin/env node
/**
 * Checks a built bundle against the source it was cut from.
 *
 * The build quantises positions, so "it loaded without throwing" is not
 * evidence it is right — a wrong bounding box or a transposed axis produces a
 * mesh that still decodes cleanly and is simply the wrong shape. This decodes
 * every part back and compares it vertex by vertex with the original float32,
 * reporting the worst error in millimetres.
 *
 *   node scripts/validate-anatomy-bundle.mjs --src <dir> --region thorax
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const SRC = resolve(args.src ?? "./atlas-src");
const OUT = resolve(args.out ?? "./public/anatomy");
const REGION = args.region ?? "thorax";

const atlas = JSON.parse(readFileSync(join(SRC, "atlas.json"), "utf8"));
const bundle = JSON.parse(readFileSync(join(OUT, `${REGION}.json`), "utf8"));
const bin = gunzipSync(readFileSync(join(OUT, `${REGION}.bin.gz`)));
const byId = new Map(atlas.parts.map(p => [p.id, p]));

const chunks = new Map();
const chunk = i => {
  if (!chunks.has(i)) chunks.set(i, readFileSync(join(SRC, `body-${i}.bin`)));
  return chunks.get(i);
};

/* Signed volume by the divergence theorem. For a closed mesh it is positive
   when the faces wind counter-clockwise seen from outside, and negative when
   they are inside out. The high-resolution source is in a left-handed space
   and one axis is negated on import, which reverses winding — get the
   compensation wrong and every mesh renders as its own inner surface, lit from
   within, with no error anywhere. This is the check for that. */
function signedVolume(pos, idx) {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += (
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
    ) / 6;
  }
  return v;
}

function decode(bin, part) {
  const posBytes = part.vertexCount * 6;
  const q = new Uint16Array(bin.buffer, bin.byteOffset + part.offset, part.vertexCount * 3);
  const idx = new Uint16Array(
    bin.buffer, bin.byteOffset + part.offset + posBytes, part.indexCount,
  );
  const [min, max] = part.bounds;
  const pos = new Float32Array(part.vertexCount * 3);
  for (let i = 0; i < part.vertexCount; i++) {
    for (let c = 0; c < 3; c++) {
      pos[i * 3 + c] = min[c] + (q[i * 3 + c] / 65535) * (max[c] - min[c]);
    }
  }
  return { pos, idx };
}

let worst = 0, worstName = "", checked = 0, tris = 0, extras = 0;
let inverted = [];
for (const part of bundle.parts) {
  /* Parts carried in from elsewhere have no BodyParts3D original to compare
     against, so the vertex-by-vertex check does not apply. They still have to
     hold up on their own, which is what the geometry checks below do. */
  if (part.id.startsWith("Z_")) {
    const posBytes = part.vertexCount * 6;
    const idx = new Uint16Array(
      bin.buffer.slice(bin.byteOffset + part.offset + posBytes,
                       bin.byteOffset + part.offset + posBytes + part.indexCount * 2),
    );
    for (const v of idx) if (v >= part.vertexCount) throw new Error(`${part.name}: index out of range`);
    if (part.indexCount % 3) throw new Error(`${part.name}: not whole triangles`);
    extras++; tris += part.indexCount / 3;
    continue;
  }
  const src = byId.get(part.id);
  if (!src) throw new Error(`${part.name}: not in source atlas`);

  /* Upgraded from the official archive: different geometry, so there is no
     vertex-by-vertex diff to make. What must hold is that it is the same
     structure in the same place, and the right way out. */
  if (src.vertexCount !== part.vertexCount) {
    for (let c = 0; c < 3; c++) {
      const drift = Math.max(
        Math.abs(part.bounds[0][c] - src.bounds[0][c]),
        Math.abs(part.bounds[1][c] - src.bounds[1][c]),
      );
      if (drift > 0.02) {
        throw new Error(`${part.name}: sits ${(drift * 100).toFixed(1)}cm from where the atlas puts it`);
      }
    }
    const { pos, idx } = decode(bin, part);
    for (const v of idx) if (v >= part.vertexCount) throw new Error(`${part.name}: index out of range`);
    if (signedVolume(pos, idx) < 0) inverted.push(part.name);
    checked++; tris += part.indexCount / 3;
    continue;
  }

  const buf = chunk(src.chunk);
  const orig = new Float32Array(
    buf.buffer.slice(buf.byteOffset + src.positions, buf.byteOffset + src.positions + src.vertexCount * 12),
  );

  const posBytes = part.vertexCount * 6;
  const q = new Uint16Array(bin.buffer.slice(bin.byteOffset + part.offset, bin.byteOffset + part.offset + posBytes));
  const idx = new Uint16Array(
    bin.buffer.slice(bin.byteOffset + part.offset + posBytes,
                     bin.byteOffset + part.offset + posBytes + part.indexCount * 2),
  );

  const [min, max] = part.bounds;
  for (let i = 0; i < part.vertexCount; i++) {
    for (let c = 0; c < 3; c++) {
      const span = max[c] - min[c];
      const got = min[c] + (q[i * 3 + c] / 65535) * span;
      const err = Math.abs(got - orig[i * 3 + c]);
      if (err > worst) { worst = err; worstName = part.name; }
    }
  }
  for (const v of idx) if (v >= part.vertexCount) throw new Error(`${part.name}: index ${v} out of range`);
  if (part.indexCount % 3) throw new Error(`${part.name}: ${part.indexCount} indices is not whole triangles`);

  checked++;
  tris += part.indexCount / 3;
}

console.log(`parts checked   ${checked}${extras ? `  (+${extras} imported, geometry-only)` : ""}`);
console.log(`triangles       ${tris.toLocaleString()}`);
console.log(`worst error     ${(worst * 1000).toFixed(4)} mm  (${worstName})`);
console.log(`bundle          ${(bin.length / 1e6).toFixed(2)}MB raw`);
if (inverted.length) {
  console.error(`\nFAIL: ${inverted.length} meshes wound inside out, e.g. ${inverted.slice(0, 3).join(", ")}`);
  process.exit(1);
}
if (worst > 0.001) { console.error("\nFAIL: worst error over 1mm"); process.exit(1); }
console.log("\nOK");
