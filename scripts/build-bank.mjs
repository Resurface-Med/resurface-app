#!/usr/bin/env node
/**
 * Building the shared bank from a folder of lectures.
 *
 * Three steps, on purpose, with a place to stop between each:
 *
 *   ingest   read the PDFs, guess which subject each belongs to, write a
 *            manifest you can correct before a single token is spent
 *   generate one call per lecture, then every check that can be made without
 *            a human, into pending/ for you to read
 *   merge    approved questions into public/decks, ids continued, index
 *            rewritten, audit run
 *
 * The middle step never writes to the bank. A wrong question in a shared
 * bank is wrong for every student at once, and unlike a generated deck it
 * is not theirs to distrust — so nothing reaches public/decks without
 * someone having read it.
 *
 * The prompt is imported from the backend rather than copied. A copy drifts
 * the first time either side is edited, and then the bank and the live app
 * are quietly producing different products.
 *
 *   node scripts/build-bank.mjs ingest ~/lectures
 *   node scripts/build-bank.mjs generate
 *   node scripts/build-bank.mjs merge
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const DECKS = join(APP, "public", "decks");
const WORK = join(APP, ".bank");
const MANIFEST = join(WORK, "manifest.json");
const PENDING = join(WORK, "pending");

const MODEL = process.env.BANK_MODEL || "claude-sonnet-5";
const PER_LECTURE = Number(process.env.BANK_PER_LECTURE || 10);

/* The prompt lives in the backend, beside the route that serves it. Both
   repos sit side by side in ~/resurface, and this script never ships. */
const PROMPT_PATH = resolve(APP, "..", "resurface-backend", "lib", "prompt.js");

async function loadPrompt() {
  if (!existsSync(PROMPT_PATH)) {
    die(`Can't find the prompt at ${PROMPT_PATH}.\n` +
        `This script reads it from the backend so the two can never drift.\n` +
        `Check out resurface-backend beside resurface-app and try again.`);
  }
  return import(pathToFileURL(PROMPT_PATH).href);
}

const die = m => { console.error(`\n${m}\n`); process.exit(1); };
const say = (...a) => console.log(...a);

/* ── The subjects, and guessing which one a lecture belongs to ──────
   A flat folder means the filename is all there is to go on. Every guess
   goes in the manifest for correction; nothing is generated until you have
   had the chance to look. */
const SUBJECTS = {
  Anatomy: ["anatom", "muscle", "skeleton", "bone", "joint", "limb", "thorax", "abdomen"],
  Biochemistry: ["biochem", "metabol", "glycolysis", "enzyme", "protein", "lipid", "krebs", "atp"],
  Embryology: ["embryo", "development", "fetal", "foetal", "gastrul", "organogen"],
  Genetics: ["genetic", "dna", "chromosom", "inherit", "mutation", "genom", "mendel"],
  Histology: ["histolog", "tissue", "epitheli", "microscop", "stain"],
  Immunology: ["immun", "antibod", "antigen", "lymphocyte", "inflamm", "complement"],
  Pathology: ["patholog", "disease", "neoplas", "cancer", "necros", "infect"],
  Pharmacology: ["pharmac", "drug", "receptor", "agonist", "dose", "kinetic"],
  Physiology: ["physiol", "cardiac", "cardiovas", "respir", "renal", "nephron", "neuro", "endocrin", "homeostas"],
};

function guessSubject(name) {
  const n = name.toLowerCase();
  let best = null, hits = 0;
  for (const [subject, words] of Object.entries(SUBJECTS)) {
    const c = words.filter(w => n.includes(w)).length;
    if (c > hits) { hits = c; best = subject; }
  }
  return best;
}

/**
 * "25 September 2025 nature of infection - Tagged.pdf" → "Nature Of Infection"
 * "12.11.24ARUbreathlessness - Tagged.pdf"             → "Breathlessness"
 *
 * Dates are stripped without requiring a space after them, because lecture
 * files are named by whoever uploaded them and half of ours run the date
 * straight into the title. Words are split back out of runTogetherCase for
 * the same reason.
 */
function guessTopic(name) {
  return basename(name, ".pdf")
    .replace(/\.(pptx?|docx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/g, " ")          // 12.11.24, glued or not
    .replace(/\b\d{1,2}\s+[a-z]+\s+\d{4}\b/gi, " ")             // 25 September 2025
    .replace(/\bARU\b|\bARU(?=[A-Za-z])/g, " ")                  // the institution, glued or not
    .replace(/\btagged\b|\bfinal\b|\bcopy\b|\bv\d+\b|\blecture\b|\bslides?\b/gi, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")                          // runTogether → run Together
    .replace(/^\W+|\W+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || "General";
}

/* ── Reading a lecture ───────────────────────────────────────────── */
async function extract(file) {
  const require = createRequire(join(APP, "package.json"));
  const pdfjsPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  /* pdf.js wants this and Node 20 does not have it. */
  if (!Promise.withResolvers) {
    Promise.withResolvers = () => {
      let resolve, reject;
      const promise = new Promise((a, b) => { resolve = a; reject = b; });
      return { promise, resolve, reject };
    };
  }
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map(it => it.str).join(" ").replace(/\s+/g, " ").trim();
    if (line) text += `\n--- Slide ${i} ---\n${line}`;
    page.cleanup();
  }
  return { text: text.trim(), pages: doc.numPages };
}

/* ── ingest ──────────────────────────────────────────────────────── */
async function ingest(folder) {
  if (!folder) die("Where are the lectures?  node scripts/build-bank.mjs ingest ~/lectures");
  const dir = resolve(folder.replace(/^~/, process.env.HOME));
  const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith(".pdf")).sort();
  if (!files.length) die(`No PDFs in ${dir}.`);

  mkdirSync(WORK, { recursive: true });
  const rows = [];
  for (const f of files) {
    const path = join(dir, f);
    process.stdout.write(`  reading ${f} … `);
    try {
      const { text, pages } = await extract(path);
      const subject = guessSubject(f);
      rows.push({
        file: path,
        subject,
        topic: guessTopic(f),
        pages,
        words: text.split(/\s+/).length,
        skip: !subject || text.length < 400,
        note: !subject ? "no subject guessed — fill it in" : text.length < 400 ? "almost no text — a scan?" : "",
      });
      say(`${pages}pp`);
    } catch (e) {
      rows.push({ file: path, subject: null, topic: guessTopic(f), pages: 0, words: 0, skip: true, note: `unreadable: ${e.message}` });
      say("failed");
    }
  }

  writeFileSync(MANIFEST, JSON.stringify({ perLecture: PER_LECTURE, lectures: rows }, null, 2));
  const unsure = rows.filter(r => r.skip);
  say(`\n${rows.length} lectures → ${MANIFEST}`);
  if (unsure.length) {
    say(`\n${unsure.length} need you:`);
    for (const r of unsure) say(`   ${basename(r.file)} — ${r.note}`);
  }
  say(`\nRead the manifest, fix any subject or topic that is wrong, set "skip": true on\n` +
      `anything you don't want, then:  node scripts/build-bank.mjs generate`);
}

/* ── generate ────────────────────────────────────────────────────── */
async function callClaude({ system, text, key }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system,
      messages: [
        { role: "user", content: text },
        /* Prefilled so the reply starts inside the JSON and cannot open with
           a sentence about what it is about to do. */
        { role: "assistant", content: "{" },
      ],
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`${r.status} ${e?.error?.message || ""}`);
  }
  const data = await r.json();
  return { text: "{" + (data.content?.[0]?.text || ""), usage: data.usage };
}

function existingQuestions() {
  const index = JSON.parse(readFileSync(join(DECKS, "index.json"), "utf8"));
  const all = [];
  for (const { file } of index) {
    const deck = JSON.parse(readFileSync(join(DECKS, file), "utf8"));
    all.push(...deck.questions);
  }
  return all;
}

const normalise = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Everything that can be judged without reading it.
 *
 * The grounding check is the one that matters: the prompt insists every
 * answer is findable in the uploaded material, and this is what tells you
 * whether that was true rather than trusting that it was.
 */
function check(q, { source, seen, exemplarWords }) {
  const bad = [];
  if (!q || typeof q.q !== "string" || !Array.isArray(q.opts)) return ["malformed"];
  if (q.opts.length !== 5) bad.push(`${q.opts.length} options, not 5`);
  if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans >= q.opts.length) bad.push("answer index out of range");
  if (new Set(q.opts.map(normalise)).size !== q.opts.length) bad.push("duplicate options");

  const words = q.q.trim().split(/\s+/).length;
  if (words < exemplarWords.min - 4 || words > exemplarWords.max + 12) {
    bad.push(`stem is ${words} words, paper runs ${exemplarWords.min}–${exemplarWords.max}`);
  }

  const key = normalise(q.opts[q.ans] ?? "");
  if (key && !normalise(source).includes(key)) bad.push("answer not found in the lecture");

  const stem = normalise(q.q);
  if (seen.has(stem)) bad.push("duplicate of a question already in the bank");

  if (!q.exp || q.exp.length < 15) bad.push("no real explanation");
  return bad;
}

async function generate() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) die("Set ANTHROPIC_API_KEY (console.anthropic.com — a Pro or Max plan is not API access).");
  if (!existsSync(MANIFEST)) die("No manifest. Run ingest first.");

  const { systemPrompt } = await loadPrompt();
  const { perLecture, lectures } = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const todo = lectures.filter(l => !l.skip && l.subject);
  if (!todo.length) die("Nothing to do — every lecture is skipped or has no subject.");

  const bank = existingQuestions();
  const seen = new Set(bank.map(q => normalise(q.q)));
  const lens = bank.map(q => q.q.trim().split(/\s+/).length).sort((a, b) => a - b);
  const exemplarWords = { min: lens[Math.floor(lens.length * 0.05)] || 8, max: lens[Math.floor(lens.length * 0.95)] || 40 };

  mkdirSync(PENDING, { recursive: true });
  const bySubject = new Map();
  let spent = { input: 0, output: 0 };

  for (const [i, lec] of todo.entries()) {
    process.stdout.write(`  [${i + 1}/${todo.length}] ${lec.subject} · ${lec.topic} … `);
    try {
      const { text } = await extract(lec.file);
      const res = await callClaude({ system: systemPrompt(perLecture, false), text, key });
      spent.input += res.usage?.input_tokens || 0;
      spent.output += res.usage?.output_tokens || 0;

      const parsed = JSON.parse(res.text.replace(/^```json\s*/i, "").replace(/```\s*$/i, ""));
      const items = parsed.questions || parsed;

      let kept = 0;
      for (const q of items) {
        const faults = check(q, { source: text, seen, exemplarWords });
        const row = {
          cat: `${lec.subject}: ${lec.topic}`,
          year: "Year 1",
          block: "Principles",
          deck: lec.subject,
          q: q.q, opts: q.opts, ans: q.ans, exp: q.exp, optExp: q.optExp ?? null,
          _source: basename(lec.file),
          _faults: faults,
        };
        if (!faults.length) { seen.add(normalise(q.q)); kept += 1; }
        if (!bySubject.has(lec.subject)) bySubject.set(lec.subject, []);
        bySubject.get(lec.subject).push(row);
      }
      say(`${kept}/${items.length} clean`);
    } catch (e) {
      say(`failed — ${e.message}`);
    }
  }

  for (const [subject, rows] of bySubject) {
    const file = join(PENDING, `${subject.toLowerCase()}.json`);
    writeFileSync(file, JSON.stringify(rows, null, 2));
    writeFileSync(file.replace(/\.json$/, ".md"), review(subject, rows));
  }

  const all = [...bySubject.values()].flat();
  const clean = all.filter(r => !r._faults.length).length;
  say(`\n${all.length} questions, ${clean} clean, ${all.length - clean} flagged.`);
  say(`Tokens: ${spent.input.toLocaleString()} in, ${spent.output.toLocaleString()} out.`);
  say(`\nRead ${PENDING}/*.md. Delete anything you don't want from the matching .json,`);
  say(`then:  node scripts/build-bank.mjs merge`);
}

function review(subject, rows) {
  let md = `# ${subject} — ${rows.length} questions to review\n\n`;
  md += `Delete what you don't want from \`${subject.toLowerCase()}.json\`, then merge.\n\n`;
  for (const [i, r] of rows.entries()) {
    md += `### ${i + 1}. ${r.cat}\n`;
    if (r._faults.length) md += `> **flagged:** ${r._faults.join("; ")}\n\n`;
    md += `${r.q}\n\n`;
    r.opts.forEach((o, k) => { md += `- ${k === r.ans ? "**" + o + "**" : o}\n`; });
    md += `\n${r.exp}\n\n_${r._source}_\n\n---\n\n`;
  }
  return md;
}

/* ── merge ───────────────────────────────────────────────────────── */
function merge() {
  if (!existsSync(PENDING)) die("Nothing pending. Run generate first.");
  const files = readdirSync(PENDING).filter(f => f.endsWith(".json"));
  if (!files.length) die("Nothing pending.");

  const index = JSON.parse(readFileSync(join(DECKS, "index.json"), "utf8"));
  /* Ids are global across the deck files, not per file, so the next one
     continues from the highest anywhere in the bank. */
  let nextId = Math.max(...existingQuestions().map(q => q.id)) + 1;
  let added = 0;

  for (const f of files) {
    const rows = JSON.parse(readFileSync(join(PENDING, f), "utf8"));
    const usable = rows.filter(r => !r._faults?.length);
    if (!usable.length) continue;

    const subject = usable[0].deck;
    const entry = index.find(e => e.deck === subject);
    const file = entry ? entry.file : `${subject.toLowerCase()}.json`;
    const path = join(DECKS, file);

    const deck = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { deck: subject, categories: [], questions: [] };

    for (const r of usable) {
      const { _source, _faults, ...q } = r;
      deck.questions.push({ id: nextId++, ...q });
      if (!deck.categories.includes(q.cat)) deck.categories.push(q.cat);
      added += 1;
    }
    deck.categories.sort();
    writeFileSync(path, JSON.stringify(deck, null, 2) + "\n");

    if (entry) entry.count = deck.questions.length;
    else index.push({ deck: subject, file, count: deck.questions.length });
    say(`  ${subject}: +${usable.length} → ${deck.questions.length}`);
  }

  writeFileSync(join(DECKS, "index.json"), JSON.stringify(index, null, 2) + "\n");
  say(`\n${added} questions added. Now run:  node scripts/audit-questions.mjs`);
}

/* ── ─────────────────────────────────────────────────────────────── */
const [cmd, arg] = process.argv.slice(2);
if (cmd === "ingest") await ingest(arg);
else if (cmd === "generate") await generate();
else if (cmd === "merge") merge();
else die("node scripts/build-bank.mjs ingest <folder> | generate | merge");
