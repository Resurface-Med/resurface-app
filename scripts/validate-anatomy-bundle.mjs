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

let worst = 0, worstName = "", checked = 0, tris = 0;
for (const part of bundle.parts) {
  const src = byId.get(part.id);
  if (!src) throw new Error(`${part.name}: not in source atlas`);
  if (src.vertexCount !== part.vertexCount) throw new Error(`${part.name}: vertex count drifted`);

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

console.log(`parts checked   ${checked}`);
console.log(`triangles       ${tris.toLocaleString()}`);
console.log(`worst error     ${(worst * 1000).toFixed(4)} mm  (${worstName})`);
console.log(`bundle          ${(bin.length / 1e6).toFixed(2)}MB raw`);
if (worst > 0.001) { console.error("\nFAIL: worst error over 1mm"); process.exit(1); }
console.log("\nOK");
