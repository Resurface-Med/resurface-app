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
  /* The heart's own circulation, both ways. It used to be the cardiac system
     plus anything named "coronary", which quietly dropped the venous half: the
     great, middle and small cardiac veins are in the venous system and are not
     called coronary, so the heart appeared with arteries and no veins. Nineteen
     cardiac veins were in the atlas the whole time. */
  heart: p =>
    NOT_ACTUALLY_CARDIAC.test(lower(p))
      ? false
      : p.system === "cardiac" ||
        /coronary|cardiac vein|interventricular vein|oblique vein of left atrium/.test(lower(p)),

  abdomen: p =>
    p.system === "digestive" ||
    /portal|mesenteric|celiac|splenic|hepatic|gastric|peritoneum|omentum|kidney|ureter|suprarenal|spleen|pancreas/.test(lower(p)),
};

/* Which regions the extras belong in. The heart is deliberately not one of
   them: a heart region with lungs around it is a picture of a chest. */
const EXTRA_REGIONS = { thorax: true };

const pick = REGIONS[REGION];
if (!pick) {
  console.error(`unknown region "${REGION}" — have: ${Object.keys(REGIONS).join(", ")}`);
  process.exit(1);
}

/* Structures the atlas does not contain at all.
 *
 * The lungs are not filtered out of BodyParts3D by anything here — they are
 * absent from all 2,234 meshes, and from the official partof archive too: the
 * concepts are listed, the element meshes are not shipped. A chest with no
 * lungs in it is not a chest, so they come from Z-Anatomy, which has them and
 * is CC BY-SA like the rest.
 *
 * They drop straight in because both trace back to BodyParts3D and share its
 * coordinate space — the lobes land at y 1.17-1.43 against a heart at
 * 1.25-1.34, which is where lungs go. No registration, no rescaling.
 *
 * Pleura is deliberately not here. Z-Anatomy has it at 112,288 triangles, it
 * would add 0.8MB, and it is a sheet that wraps everything else — switched on
 * it hides the entire chest, and switched off it costs its bytes for nothing.
 */
const EXTRAS = {
  Superior_lobe_of_right_lung: { name: "Superior lobe of right lung", system: "respiratory" },
  Middle_lobe_of_right_lung:   { name: "Middle lobe of right lung",   system: "respiratory" },
  Inferior_lobe_of_right_lung: { name: "Inferior lobe of right lung", system: "respiratory" },
  Superior_lobe_of_left_lung:  { name: "Superior lobe of left lung",  system: "respiratory" },
  Inferior_lobe_of_left_lung:  { name: "Inferior lobe of left lung",  system: "respiratory" },
  Prepericardial_nodes:        { name: "Prepericardial nodes",        system: "lymphatic" },
  Lateral_pericardial_nodes:   { name: "Lateral pericardial nodes",   system: "lymphatic" },
};

/* Reads a triangulated Wavefront OBJ holding several named objects.
   OBJ vertex indices are global across the file, not per object, so each
   object's faces are remapped onto its own compacted vertex list here. */
function readObj(path) {
  const verts = [];
  const out = [];
  let cur = null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      verts.push(x, y, z);
    } else if (line.startsWith("o ")) {
      cur = { key: line.slice(2).trim(), faces: [] };
      out.push(cur);
    } else if (line.startsWith("f ") && cur) {
      /* "f a/b/c d/e/f g/h/i" — only the position index matters here, and a
         negative index counts back from the end of what has been read. */
      const idx = line.slice(2).trim().split(/\s+/).map(tok => {
        const n = parseInt(tok.split("/")[0], 10);
        return n < 0 ? verts.length / 3 + n : n - 1;
      });
      for (let i = 1; i + 1 < idx.length; i++) cur.faces.push(idx[0], idx[i], idx[i + 1]);
    }
  }

  return out.map(o => {
    const remap = new Map();
    const positions = [];
    const indices = new Uint32Array(o.faces.length);
    o.faces.forEach((v, i) => {
      let n = remap.get(v);
      if (n === undefined) {
        n = remap.size;
        remap.set(v, n);
        positions.push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
      }
      indices[i] = n;
    });
    const pos = new Float32Array(positions);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        if (pos[i + c] < lo[c]) lo[c] = pos[i + c];
        if (pos[i + c] > hi[c]) hi[c] = pos[i + c];
      }
    }
    return { key: o.key, positions: pos, indices, bounds: [lo, hi] };
  });
}

/* The published atlas against BodyParts3D's own release.
 *
 * human-atlas ships a heavily decimated copy — arteries take the worst of it,
 * because a thin tube loses its round section and then its continuity, which
 * is why the coronaries render as broken squiggles rather than a tree. The
 * official partof archive carries the same meshes at about 4.6x on vessels.
 *
 * It is in a different space: millimetres, Z-up, and offset. Solved against
 * all 922 parts the two have in common, exact to the last decimal place:
 *
 *   x =  objX * 0.001
 *   y =  objZ * 0.001 + 0.078111
 *   z = -objY * 0.001 - 0.100000
 *
 * Negating an axis flips handedness, so triangle winding is reversed on the
 * way in — without that every face points inward and the mesh renders as its
 * own inside surface. */
const HIRES_SCALE = 0.001;
const HIRES_DY = 0.078111;
const HIRES_DZ = -0.1;

function readHires(path) {
  const px = [], py = [], pz = [];
  const faces = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      px.push(x * HIRES_SCALE);
      py.push(z * HIRES_SCALE + HIRES_DY);
      pz.push(-y * HIRES_SCALE + HIRES_DZ);
    } else if (line.startsWith("f ")) {
      const idx = line.slice(2).trim().split(/\s+/).map(tok => {
        const n = parseInt(tok.split("/")[0], 10);
        return n < 0 ? px.length + n : n - 1;
      });
      /* Fan-triangulate, winding untouched. Negating an axis flips handedness,
         so this looked like it needed reversing to compensate — it does not.
         The archive's own faces wind the other way round from the shipped
         copy's, and the two cancel. Reversing them made every mesh inside out,
         which is not visible in a bounding box or a triangle count and was
         caught only by the signed-volume check in the validator. */
      for (let i = 1; i + 1 < idx.length; i++) faces.push(idx[0], idx[i], idx[i + 1]);
    }
  }

  const remap = new Map();
  const pos = [];
  const indices = new Uint32Array(faces.length);
  faces.forEach((v, i) => {
    let n = remap.get(v);
    if (n === undefined) {
      n = remap.size;
      remap.set(v, n);
      pos.push(px[v], py[v], pz[v]);
    }
    indices[i] = n;
  });

  const positions = new Float32Array(pos);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (positions[i + c] < lo[c]) lo[c] = positions[i + c];
      if (positions[i + c] > hi[c]) hi[c] = positions[i + c];
    }
  }
  return { positions, indices, bounds: [lo, hi] };
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
let extraCount = 0;

/* Concepts group meshes under the name a person would use — "heart" is one
   concept over several meshes — so the ones this region touches come along.
   Declared before the parts loop because the extras add to it. */
const keptIds = new Set(parts.map(p => p.id));
const concepts = atlas.concepts
  .map(c => ({ ...c, elements: c.elements.filter(e => keptIds.has(e)) }))
  .filter(c => c.elements.length);

let hiresUsed = 0;
for (const p of parts) {
  /* Better geometry wins, but only if there is more of it: a handful of parts
     are decimated less in the shipped copy than in the archive. */
  const hiresPath = args.hires ? join(resolve(args.hires), `${p.id}.obj`) : null;
  if (hiresPath && existsSync(hiresPath)) {
    const g = readHires(hiresPath);
    /* A ceiling, not a blanket upgrade. Taking every part at full resolution
       puts the chest at 8.66MB, which is not a thing to send a student on
       halls wifi. The ceiling is per part and it falls the right way: the
       coronaries and their branches are two to four thousand triangles and
       sail under it, while the handful of large walls and bones that would
       eat the budget stay as they are — and they are the parts a decimation
       barely shows on, being broad surfaces rather than thin tubes. */
    /* Vessels are exempt. A flat ceiling put the trunk of the right coronary
       artery, at 4,502 triangles, on the wrong side of it — which is the exact
       structure the whole upgrade is for. Thin tubes are where decimation
       shows and where the triangles are cheap; broad surfaces are the reverse. */
    const thin = p.system === "arterial" || p.system === "venous" || p.system === "nervous";
    const ceiling = thin || !args.hiresMax ? Infinity : Number(args.hiresMax);
    if (g.indices.length > p.indexCount && g.positions.length / 3 <= 65535
        && g.indices.length / 3 <= ceiling) {
      const n = g.positions.length / 3;
      const [min, max] = g.bounds;
      const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const quant = new Uint16Array(n * 3);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) {
          const t = span[c] > 0 ? (g.positions[i * 3 + c] - min[c]) / span[c] : 0;
          quant[i * 3 + c] = Math.round(Math.min(1, Math.max(0, t)) * 65535);
        }
      }
      const narrow = Uint16Array.from(g.indices);
      const positions = Buffer.from(quant.buffer);
      const pad = (4 - ((positions.length + narrow.byteLength) % 4)) % 4;
      manifest.push({
        id: p.id, name: p.name, conceptId: p.conceptId, system: p.system,
        offset, vertexCount: n, indexCount: g.indices.length, bounds: g.bounds,
      });
      blocks.push(positions, Buffer.from(narrow.buffer), Buffer.alloc(pad));
      offset += positions.length + narrow.byteLength + pad;
      hiresUsed++;
      continue;
    }
  }

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

/* Appended after the atlas parts, so the offsets already written stay valid
   and a bundle built without --extras is byte-identical up to this point. */
if (args.extras && EXTRA_REGIONS[REGION]) {
  for (const o of readObj(resolve(args.extras))) {
    const meta = EXTRAS[o.key];
    if (!meta) continue;

    const n = o.positions.length / 3;
    const [min, max] = o.bounds;
    const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const quant = new Uint16Array(n * 3);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const t = span[c] > 0 ? (o.positions[i * 3 + c] - min[c]) / span[c] : 0;
        quant[i * 3 + c] = Math.round(Math.min(1, Math.max(0, t)) * 65535);
      }
    }

    let hi = 0;
    for (const v of o.indices) if (v > hi) hi = v;
    if (hi > 65535) throw new Error(`${meta.name}: index ${hi} does not fit in uint16`);
    const narrow = Uint16Array.from(o.indices);

    const positions = Buffer.from(quant.buffer);
    const pad = (4 - ((positions.length + narrow.byteLength) % 4)) % 4;

    manifest.push({
      id: `Z_${o.key}`,
      name: meta.name,
      conceptId: `Z:${o.key}`,
      system: meta.system,
      offset,
      vertexCount: n,
      indexCount: o.indices.length,
      bounds: o.bounds,
    });
    concepts.push({ id: `Z:${o.key}`, name: meta.name.toLowerCase(), elements: [`Z_${o.key}`] });

    blocks.push(positions, Buffer.from(narrow.buffer), Buffer.alloc(pad));
    offset += positions.length + narrow.byteLength + pad;
    extraCount++;
  }
}

const bin = Buffer.concat(blocks);
const gz = gzipSync(bin, { level: 9 });

/* Concepts group meshes under the name a person would use — "heart" is one
   concept over several meshes — so the ones this region touches come along. */

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
      triangles: manifest.reduce((s, p) => s + p.indexCount / 3, 0),
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
console.log(`hi-res      ${hiresUsed} of ${parts.length} from the official archive`);
console.log(`meshes      ${parts.length + extraCount}${extraCount ? ` (${extraCount} from Z-Anatomy)` : ""}`);
console.log(`triangles   ${manifest.reduce((s, p) => s + p.indexCount / 3, 0).toLocaleString()}`);
console.log(`concepts    ${concepts.length}`);
console.log(`widest idx  ${widest} (uint16 ceiling 65535)`);
console.log(`raw         ${mb(bin.length)}`);
console.log(`gzipped     ${mb(gz.length)}   -> ${OUT}/${REGION}.bin.gz`);
