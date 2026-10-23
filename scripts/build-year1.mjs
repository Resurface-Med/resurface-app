#!/usr/bin/env node
/**
 * Year 1 Principles, generated lecture by lecture (2026-10-23).
 *
 * The same thing Generate does for a student, run over a whole block:
 * the slide text read the way the app reads it, the backend's own prompt
 * and Gemini call, then the same two filters the route applies (answers
 * given away in the stem, repeats). Nothing is reimplemented that the
 * backend already has, so the bank and the app cannot drift apart.
 *
 * Writes one file per lecture into .bank/year1/, for review before any of
 * it reaches the database. Re-running skips lectures already written.
 *
 *   node scripts/build-year1.mjs <manifest.json> <lectures dir> [--week 1] [--only w1-04] [--dry]
 *
 * --topup asks again, once, for any lecture that came back short, telling
 * the model what it already wrote (as Generate does for "add more").
 *
 * --dry reads every lecture and reports how much text it found, with no
 * call to the model.
 *
 * The manifest is the weighting site's export: [{ id, week, title, file,
 * subject, weight }]. Skip is 0 questions, light 10, normal 20, heavy 30.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const BACKEND = resolve(APP, "..", "resurface-backend");
const OUT = join(APP, ".bank", "year1");

const COUNT = { skip: 0, light: 10, normal: 20, heavy: 30 };
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const PER_MINUTE = 4;          // the free key's 15/min is shared with students
const ATTEMPT_MS = 55_000;     // as the route

const die = m => { console.error(`\n${m}\n`); process.exit(1); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function env() {
  const p = join(BACKEND, ".env.local");
  if (!existsSync(p)) die(`No ${p}. Put GEMINI_API_KEY in it.`);
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key || /PASTE/.test(key)) die("GEMINI_API_KEY in .env.local is not a real key yet.");
  return key;
}

/* ── Reading a lecture, as GenerateMode reads it ─────────────────── */

async function readPptx(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const slides = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  const words = xml => (xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || []).map(m => m.replace(/<[^>]+>/g, "")).join(" ").trim();
  let text = "";
  for (const name of slides) {
    const slideText = words(await zip.files[name].async("text"));
    /* Unlike Generate, the speaker notes come too: the physiology lectures
       keep most of their teaching there (Action Potentials: 3k characters
       on the slides, 12k in the notes). A bare slide number is not a note. */
    const rels = zip.files[name.replace("slides/", "slides/_rels/") + ".rels"];
    const target = rels && (await rels.async("text")).match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1];
    const notes = target && zip.files[`ppt/notesSlides/${target}`] ? words(await zip.files[`ppt/notesSlides/${target}`].async("text")) : "";
    const note = /^\d*$/.test(notes) ? "" : notes;
    if (slideText || note) text += `\n--- Slide ---\n${slideText}${note ? `\n[Speaker notes] ${note}` : ""}`;
  }
  return text;
}

async function readDocx(path) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const xml = await zip.files["word/document.xml"].async("text");
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
    .map(p => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]+>/g, "")).join(""))
    .map(s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim())
    .filter(Boolean)
    .join("\n");
}

function readPdf(path) {
  return execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
}

/* A PowerPoint 97 file has no XML. Its text sits in TextCharsAtom (UTF-16)
   and TextBytesAtom (Latin-1) records; the slide-master boilerplate is
   dropped. The app refuses .ppt outright, so this is the bank's own. */
function readPpt(path) {
  const b = readFileSync(path);
  const out = [];
  for (let i = 0; i + 8 <= b.length; i++) {
    const type = b.readUInt16LE(i + 2);
    if (type !== 0x0fa0 && type !== 0x0fa8) continue;
    if (b.readUInt16LE(i) !== 0) continue;
    const len = b.readUInt32LE(i + 4);
    if (!len || len > 20000 || i + 8 + len > b.length) continue;
    const raw = b.subarray(i + 8, i + 8 + len);
    const s = (type === 0x0fa0 ? raw.toString("utf16le") : raw.toString("latin1")).replace(/\r/g, "\n").trim();
    if (s.length > 1 && !/^(Click to edit|Edit Master|Second level|Third level|Fourth level|Fifth level)/.test(s) && out.at(-1) !== s) out.push(s);
    i += 7 + len;
  }
  return out.join("\n");
}

async function readLecture(path) {
  const ext = path.split(".").pop().toLowerCase();
  if (ext === "pptx" || ext === "pptm") return readPptx(path);
  if (ext === "docx") return readDocx(path);
  if (ext === "pdf") return readPdf(path);
  if (ext === "ppt") return readPpt(path);
  throw new Error(`Can't read .${ext}`);
}

function findFile(dir, name) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { const f = findFile(p, name); if (f) return f; }
    else if (e === name) return p;
  }
  return null;
}

/* ── The route, without the HTTP ─────────────────────────────────── */

async function backend() {
  const imp = f => import(pathToFileURL(join(BACKEND, "lib", f)).href);
  const [{ callGemini, parseJson }, { systemPrompt, QUESTION_SCHEMA, alphabetise }, { dropGiveaways }, { dropRepeats }] =
    await Promise.all([imp("gemini.js"), imp("prompt.js"), imp("giveaway.js"), imp("dedupe.js")]);

  /* parseQuestions from app/api/generate/route.js. */
  const parse = text => {
    const parsed = parseJson(text);
    const list = Array.isArray(parsed) ? parsed : parsed?.questions;
    if (!Array.isArray(list)) return null;
    return list.map(q => {
      const optExp = Array.isArray(q?.optExp) ? q.optExp.map((e, i) => (i === q.ans || e === "" ? null : e)) : q?.optExp;
      const { ordered, ...rest } = q ?? {};
      return alphabetise({ ...rest, optExp }, ordered);
    });
  };

  return async function generate({ apiKey, label, text, n, existing = [] }) {
    /* As the route: the newest 60 stems, each with its answer, in the prompt. */
    const clip = (x, k) => (x.length > k ? `${x.slice(0, k)}…` : x);
    const avoid = existing.slice(-60).map(x => (x.a ? `${clip(x.q, 160)} (answer: ${clip(x.a, 60)})` : clip(x.q, 160)));
    const result = await callGemini({
      apiKey, model: MODEL, system: systemPrompt(n, avoid),
      input: [{ type: "text", text: `Topic: ${label}\n\n${text}` }],
      schema: QUESTION_SCHEMA, timeoutMs: ATTEMPT_MS,
    });
    if (!result.ok) return { error: `${result.status} ${result.message ?? ""}`.trim() };
    const parsed = parse(result.text);
    if (!parsed) return { error: "invalid JSON" };
    const fresh = dropGiveaways(parsed);
    const { kept, removed } = dropRepeats(fresh.kept, existing);
    return { questions: kept, givenAway: fresh.removed, repeats: removed, usage: result.usage };
  };
}

/* ── Run ─────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const flag = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const [manifestPath, lecturesDir] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!manifestPath || !lecturesDir) die("Usage: node scripts/build-year1.mjs <manifest.json> <lectures dir> [--week N] [--only id]");

const dry = args.includes("--dry");
const apiKey = dry ? null : env();
const generate = dry ? null : await backend();
mkdirSync(OUT, { recursive: true });

let lectures = JSON.parse(readFileSync(manifestPath, "utf8"));
if (flag("--week")) lectures = lectures.filter(l => String(l.week) === flag("--week"));
if (flag("--only")) lectures = lectures.filter(l => l.id === flag("--only"));
lectures = lectures.filter(l => COUNT[l.weight] > 0).sort((a, b) => a.week - b.week || a.order - b.order);

const failed = [];
let made = 0, last = 0;
for (const l of lectures) {
  const out = join(OUT, `${l.id}.json`);
  const topup = args.includes("--topup");
  const prev = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  if (!dry && prev && !(topup && prev.questions.length < COUNT[l.weight])) { console.log(`· ${l.id} ${l.title}: already done`); continue; }
  if (!dry && !prev && topup) continue;

  const path = findFile(lecturesDir, l.file);
  if (!path) { failed.push([l.id, "file not found"]); console.log(`✕ ${l.id} ${l.title}: file not found`); continue; }
  const text = await readLecture(path);
  const existing = (prev?.questions ?? []).map(q => ({ q: q.q, a: q.opts[q.ans] }));
  const n = COUNT[l.weight] - existing.length;
  if (dry) {
    /* The text as the model saw it, for checking questions against later. */
    mkdirSync(join(APP, ".bank", "text"), { recursive: true });
    writeFileSync(join(APP, ".bank", "text", `${l.id}.txt`), text);
    console.log(`· ${l.id} ${l.title}: ${text.length} chars for ${n} questions`);
    continue;
  }
  const label = ["Principles", `Week ${l.week}`, l.subject, l.title].join(" › ");

  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = last + 60_000 / PER_MINUTE - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    res = await generate({ apiKey, label, text, n, existing });
    if (!res.error) break;
    console.log(`  ${l.id} attempt ${attempt}: ${res.error}`);
    if (attempt < 3) await sleep(60_000);
  }
  if (res.error) { failed.push([l.id, res.error]); console.log(`✕ ${l.id} ${l.title}: ${res.error}`); continue; }

  const questions = [...(prev?.questions ?? []), ...res.questions];
  writeFileSync(out, JSON.stringify({ ...l, label, asked: COUNT[l.weight], model: MODEL, chars: text.length, ...res, questions }, null, 1));
  made += res.questions.length;
  console.log(`✓ ${l.id} ${l.title}: ${prev ? `+${res.questions.length}, now ${questions.length}` : res.questions.length}/${COUNT[l.weight]}` +
    (res.givenAway ? `, ${res.givenAway} gave the answer away` : "") + (res.repeats ? `, ${res.repeats} repeats` : ""));
}

console.log(`\n${made} questions written to ${OUT}`);
if (failed.length) { console.log("Failed:"); for (const [id, e] of failed) console.log(`  ${id}: ${e}`); }
