#!/usr/bin/env node
/**
 * Sends reviewed Year 1 lectures from .bank/year1/ to the bank-load edge
 * function, which files them under Principles › Week › Subject › Lecture
 * (migration 0043). Needs the one-off token in .bank/loader-token.
 *
 *   node scripts/load-year1.mjs <owner uuid> <week> [week …]
 *   node scripts/load-year1.mjs <owner uuid> all --dir anki-out --root "Principles (Anki)"
 *
 * --dir reads .bank/<dir> instead of year1; --root files under another top
 * deck (migration 0052). `all` takes every lecture, subjects in A–Z order.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const [owner, ...weeks] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!owner || !weeks.length) { console.error("Usage: node scripts/load-year1.mjs <owner uuid> <week> [week …]"); process.exit(1); }
const token = readFileSync(join(APP, ".bank", "loader-token"), "utf8").trim();

const dir = join(APP, ".bank", flag("--dir") ?? "year1");
const all = weeks.includes("all");
const clean = t => t.replace(/\s*\((glossary|key learning points|answers)\)$/, "");
const items = readdirSync(dir).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(readFileSync(join(dir, f), "utf8")))
  .filter(d => all || weeks.includes(String(d.week)))
  .sort((a, b) => all ? a.subject.localeCompare(b.subject) || a.order - b.order : a.week - b.week || a.order - b.order)
  .map(d => ({
    week: d.week, subject: d.subject, title: clean(d.title), order: d.order,
    /* Exhibits (an ABG table) and the line after one ride along. */
    questions: d.questions.map(({ q, opts, ans, exp, optExp, exhibit, ask }) => ({ q, opts, ans, exp, optExp, ...(exhibit ? { exhibit } : {}), ...(ask ? { ask } : {}) })),
  }));

const r = await fetch("https://uhqpljteohitvytwfadp.supabase.co/functions/v1/bank-load", {
  method: "POST",
  headers: { "content-type": "application/json", "x-bank-token": token },
  body: JSON.stringify({ owner, items, root: flag("--root") ?? undefined }),
});
console.log(r.status, await r.text(), `(${items.length} lectures, ${items.reduce((s, i) => s + i.questions.length, 0)} questions sent)`);
