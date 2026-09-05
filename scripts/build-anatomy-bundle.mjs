#!/usr/bin/env node
/**
 * Cuts a region-sized bundle out of the BodyParts3D atlas.
 *
 * The published atlas is 2,234 meshes in fifteen chunks, about 33MB gzipped,
 * and it loads as one piece. That is far more than any single question or
 * screen needs — all 402 muscles alone are 8.9MB — so this pulls out the parts
 * one region actually uses and writes them as a single file.
 *
 * Three things shrink it, all measured rather than assumed:
 *
 * 1. Indices go uint32 -> uint16. Not one of the 2,234 meshes has more than
 *    65,535 vertices, so the wide index was never doing anything. The script
 *    asserts this per part; a wrap would produce silent garbage geometry.
 * 2. Positions go float32 -> uint16, quantised across each part's own bounding
 *    box. Halves them, and integers gzip far better than floats did. The error
 *    is the box divided by 65,535 — sub-micron on an organ, which is four
 *    orders of magnitude below anything the source MRI resolved.
 * 3. Normals are dropped and recomputed on load. They were 2.13MB raw and
 *    2.07MB gzipped — int16 normals are noise-like, so they cost full price in
 *    every file and were the single largest item after positions.
 *
 * Run offline, never at request time:
 *   node scripts/build-anatomy-bundle.mjs --src <dir of atlas.json + body-*.bin> --region thorax
 *
 * The source models are BodyParts3D, which is CC BY-SA 2.1 Japan — see
 * public/anatomy/ATTRIBUTION.md. Anything cut out of them carries that licence.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
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

/* Regions are named sets of structures, not slices of the body.
   Height-banding was tried first and does not work: skin, the aorta and the
   vertebral column all run the length of the model, so a band across the chest
   drags in 1,133 meshes and 13.7MB. Selecting by what a structure *is* gives a
   smaller bundle and is the same judgement the question set needs anyway.

   Deliberately generous. Nothing here is a claim about what is examinable —
   that call comes later, against the name list this writes out. */
const lower = p => p.name.toLowerCase();
const between = (p, lo, hi) => p.bounds[0][1] >= lo && p.bounds[1][1] <= hi;

/* No "circumflex" or "interventricular" here on purpose. Both looked like they
   belonged and both are traps: "circumflex" also names the femoral, humeral and
   scapular circumflex vessels, which put eight leg and arm meshes in the chest
   bundle, and "interventricular foramen" is in the brain. The coronary branches
   that actually wanted matching all carry the word "coronary" anyway. */
const GREAT_VESSELS =
  /coronary|aorta|pulmonary trunk|pulmonary artery|pulmonary vein|vena cava|brachiocephalic|subclavian|common carotid/;

/* The source manifest's `system` field is assigned by keyword, and "ventricle"
   caught the brain. Five of the twenty-three meshes it calls cardiac are the
   cerebral ventricles and the interventricular foramen, sitting 30cm above the
   heart. Named explicitly rather than filtered by height, so this stays a
   statement about which meshes are wrong rather than a rule that quietly
   changes meaning if the model is ever re-centred. */
const NOT_ACTUALLY_CARDIAC =
  /^(third|fourth|left lateral|right lateral) ventricle$|^interventricular foramen$/;
const THORACIC_CAGE = /rib|sternum|costal|thoracic vertebra/;
const MEDIASTINUM = /diaphragm|pleura|pericard|mediastin|esophagus|thymus|trachea/;

export const REGIONS = {
  /* Chest, whole. Covers the Cardiovascular and Respiratory blocks together
     rather than splitting them, because the structures do not separate: you
     cannot show the pulmonary vessels without the lungs they run into. */
  thorax: p =>
    NOT_ACTUALLY_CARDIAC.test(lower(p)) ? false :
    p.system === "cardiac" ||
    p.system === "respiratory" ||
    GREAT_VESSELS.test(lower(p)) ||
    MEDIASTINUM.test(lower(p)) ||
    (p.system === "skeletal" && THORACIC_CAGE.test(lower(p))) ||
    ((p.system === "arterial" || p.system === "venous") && between(p, 0.98, 1.5)),

  /* Heart on its own, for a question that wants nothing else in frame. */
  heart: p =>
    NOT_ACTUALLY_CARDIAC.test(lower(p)) ? false : p.system === "cardiac" || /coronary/.test(lower(p)),

  abdomen: p =>
    p.system === "digestive" ||
    /portal|mesenteric|celiac|splenic|hepatic|gastric|peritoneum|omentum|kidney|ureter|suprarenal|spleen|pancreas/.test(lower(p)),
};

const pick = REGIONS[REGION];
if (!pick) {
  console.error(`unknown region "${REGION}" — have: ${Object.keys(REGIONS).join(", ")}`);
  process.exit(1);
}

const atlas = JSON.parse(readFileSync(join(SRC, "atlas.json"), "utf8"));
const parts = atlas.parts.filter(pick);
if (!parts.length) {
  console.error(`region "${REGION}" selected no parts`);
  process.exit(1);
}

/* Chunks are read once and held, rather than re-opened per part. The whole set
   is 57MB, which is nothing on a build machine and saves 800-odd file opens. */
const chunkCache = new Map();
function chunk(i) {
  if (!chunkCache.has(i)) chunkCache.set(i, readFileSync(join(SRC, `body-${i}.bin`)));
  return chunkCache.get(i);
}

const blocks = [];
const manifest = [];
let offset = 0;
let widest = 0;

for (const p of parts) {
  const buf = chunk(p.chunk);

  /* Quantised against the part's own box rather than the model's. A rib gets
     the full 16 bits of precision across a rib, not across a whole torso. */
  const src = new Float32Array(
    buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12),
  );
  const [min, max] = p.bounds;
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const quant = new Uint16Array(p.vertexCount * 3);
  for (let i = 0; i < p.vertexCount; i++) {
    for (let c = 0; c < 3; c++) {
      /* A flat part has zero span on some axis; every vertex is then the same
         value and the quantised coordinate is arbitrary, so pin it to 0. */
      const t = span[c] > 0 ? (src[i * 3 + c] - min[c]) / span[c] : 0;
      quant[i * 3 + c] = Math.round(Math.min(1, Math.max(0, t)) * 65535);
    }
  }
  const positions = Buffer.from(quant.buffer);
  const posBytes = positions.length;

  /* Read as uint32 and narrow. The assert is the point: a mesh over 65,535
     vertices would silently wrap and come out as garbage geometry. */
  const wide = new Uint32Array(
    buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4),
  );
  let hi = 0;
  for (const v of wide) if (v > hi) hi = v;
  widest = Math.max(widest, hi);
  if (hi > 65535) throw new Error(`${p.name}: index ${hi} does not fit in uint16`);
  if (hi >= p.vertexCount) throw new Error(`${p.name}: index ${hi} past vertexCount ${p.vertexCount}`);
  const narrow = Uint16Array.from(wide);

  /* Every block starts 4-byte aligned so the typed-array views over it can be
     taken on the buffer directly, with no copy, when this is read back. */
  const pad = (4 - ((posBytes + narrow.byteLength) % 4)) % 4;

  manifest.push({
    id: p.id,
    name: p.name,
    conceptId: p.conceptId,
    system: p.system,
    offset,
    vertexCount: p.vertexCount,
    indexCount: p.indexCount,
    bounds: p.bounds,
  });

  blocks.push(positions, Buffer.from(narrow.buffer), Buffer.alloc(pad));
  offset += posBytes + narrow.byteLength + pad;
}

const bin = Buffer.concat(blocks);
const gz = gzipSync(bin, { level: 9 });

/* Concepts group meshes under the name a person would use — "heart" is one
   concept over several meshes — so the ones this region touches come along. */
const keptIds = new Set(parts.map(p => p.id));
const concepts = atlas.concepts
  .map(c => ({ ...c, elements: c.elements.filter(e => keptIds.has(e)) }))
  .filter(c => c.elements.length);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${REGION}.bin.gz`), gz);
writeFileSync(
  join(OUT, `${REGION}.json`),
  JSON.stringify(
    {
      region: REGION,
      source: "BodyParts3D 4.0",
      licence: "CC BY-SA 2.1 JP",
      sex: atlas.sex ?? "male",
      /* Layout, stated rather than implied, so a reader is not reverse
         engineering it from offsets the way this script had to. */
      /* Stated rather than implied, so a reader is not reverse engineering it
         from offsets the way this script had to. Decode a position as
         min[c] + (q / 65535) * (max[c] - min[c]) using the part's own bounds.
         Normals are not stored: compute them from the triangles on load. */
      layout: "per part at offset: positions uint16x3 (quantised to bounds), indices uint16",
      bytes: bin.length,
      gzipBytes: gz.length,
      triangles: parts.reduce((s, p) => s + p.indexCount / 3, 0),
      parts: manifest,
      concepts,
    },
    /* Minified. It is generated, it is 700KB pretty-printed, and it is
       rewritten whole on every build — so an indented diff shows churn rather
       than change. Read it with `node -e` or jq, not with your eyes. */
  ),
);

const mb = n => (n / 1e6).toFixed(2) + "MB";
console.log(`region      ${REGION}`);
console.log(`meshes      ${parts.length}`);
console.log(`triangles   ${(parts.reduce((s, p) => s + p.indexCount / 3, 0)).toLocaleString()}`);
console.log(`concepts    ${concepts.length}`);
console.log(`widest idx  ${widest} (uint16 ceiling 65535)`);
console.log(`raw         ${mb(bin.length)}`);
console.log(`gzipped     ${mb(gz.length)}   -> ${OUT}/${REGION}.bin.gz`);
