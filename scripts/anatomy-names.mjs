#!/usr/bin/env node
/**
 * Writes out every structure in a bundle, for marking up by hand.
 *
 * The names BodyParts3D ships are FMA names — "Trunk of anterior
 * interventricular branch of left coronary artery" — which are precise and are
 * not what anyone is asked in an exam. Turning them into question material is a
 * judgement call about a curriculum, so this makes the list and leaves the two
 * columns that need a person blank:
 *
 *   exam_name  what you would actually be asked to name it
 *   teach      y / n — whether it belongs in questions at all
 *
 * Nothing is filtered or pre-judged here. Every mesh in the bundle gets a row.
 *
 *   node scripts/anatomy-names.mjs --region thorax
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const REGION = args.region ?? "thorax";
const IN = resolve(args.in ?? "./public/anatomy");
const OUT = resolve(args.out ?? "./content/anatomy");

const bundle = JSON.parse(readFileSync(join(IN, `${REGION}.json`), "utf8"));
/* A mesh sits under several concepts at once, from "leaflet of mitral valve"
   up to "body cavity content". The narrowest one — fewest meshes under it — is
   the one worth showing, since the broad ones are true of half the bundle and
   say nothing about the part in hand. */
const conceptOf = new Map();
for (const c of [...bundle.concepts].sort((a, b) => b.elements.length - a.elements.length)) {
  for (const e of c.elements) conceptOf.set(e, c.name);
}

/* Left and right of the same structure are one decision, not two, so they sort
   together — "Left ... " and "Right ... " are stripped for ordering only. */
const sortKey = n => n.replace(/^(left|right)\s+/i, "").toLowerCase();
const rows = [...bundle.parts].sort(
  (a, b) => sortKey(a.name).localeCompare(sortKey(b.name)) || a.name.localeCompare(b.name),
);

const esc = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const size = p => {
  const [lo, hi] = p.bounds;
  return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
};

const csv = [
  "id,system,source_name,concept,size_cm,exam_name,teach",
  ...rows.map(p =>
    [p.id, p.system, p.name, conceptOf.get(p.id) ?? "", (size(p) * 100).toFixed(1), "", ""]
      .map(v => esc(String(v))).join(","),
  ),
].join("\n");

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${REGION}.csv`), csv + "\n");
console.log(`${rows.length} structures -> ${OUT}/${REGION}.csv`);
