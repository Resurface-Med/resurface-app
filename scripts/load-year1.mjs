#!/usr/bin/env node
/**
 * Sends reviewed Year 1 lectures from .bank/year1/ to the bank-load edge
 * function, which files them under Principles › Week › Subject › Lecture
 * (migration 0043). Needs the one-off token in .bank/loader-token.
 *
 *   node scripts/load-year1.mjs <owner uuid> <week> [week …]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [owner, ...weeks] = process.argv.slice(2);
if (!owner || !weeks.length) { console.error("Usage: node scripts/load-year1.mjs <owner uuid> <week> [week …]"); process.exit(1); }
const token = readFileSync(join(APP, ".bank", "loader-token"), "utf8").trim();

const dir = join(APP, ".bank", "year1");
const clean = t => t.replace(/\s*\((glossary|key learning points|answers)\)$/, "");
const items = readdirSync(dir).filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(readFileSync(join(dir, f), "utf8")))
  .filter(d => weeks.includes(String(d.week)))
  .sort((a, b) => a.week - b.week || a.order - b.order)
  .map(d => ({
    week: d.week, subject: d.subject, title: clean(d.title), order: d.order,
    questions: d.questions.map(({ q, opts, ans, exp, optExp }) => ({ q, opts, ans, exp, optExp })),
  }));

const r = await fetch("https://uhqpljteohitvytwfadp.supabase.co/functions/v1/bank-load", {
  method: "POST",
  headers: { "content-type": "application/json", "x-bank-token": token },
  body: JSON.stringify({ owner, items }),
});
console.log(r.status, await r.text(), `(${items.length} lectures, ${items.reduce((s, i) => s + i.questions.length, 0)} questions sent)`);
