import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// The bank is hand-edited and Generate mode appends AI-written entries to the
// same shape, so a malformed question is a live risk. One bad entry crashes a
// study session mid-review.

const decksDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "decks");
const files = readdirSync(decksDir).filter(f => f.endsWith(".json") && f !== "index.json");
const decks = files.map(f => ({ file: f, ...JSON.parse(readFileSync(join(decksDir, f), "utf8")) }));
const all = decks.flatMap(d => d.questions.map(q => ({ ...q, _file: d.file })));

describe("question bank", () => {
  it("ships every deck listed in the manifest", () => {
    const manifest = JSON.parse(readFileSync(join(decksDir, "index.json"), "utf8"));
    expect(manifest.map(m => m.file).sort()).toEqual(files.sort());
    for (const entry of manifest) {
      const deck = decks.find(d => d.file === entry.file);
      expect(deck.questions.length, `${entry.file} count`).toBe(entry.count);
    }
  });

  it("has no duplicate ids across decks", () => {
    const seen = new Map();
    const dupes = [];
    for (const q of all) {
      if (seen.has(q.id)) dupes.push(`${q.id} in ${seen.get(q.id)} and ${q._file}`);
      seen.set(q.id, q._file);
    }
    expect(dupes).toEqual([]);
  });

  it("gives every question exactly five options", () => {
    const bad = all.filter(q => !Array.isArray(q.opts) || q.opts.length !== 5);
    expect(bad.map(q => `${q._file}#${q.id}`)).toEqual([]);
  });

  it("points every answer index at a real option", () => {
    const bad = all.filter(q => !Number.isInteger(q.ans) || q.ans < 0 || q.ans >= 5);
    expect(bad.map(q => `${q._file}#${q.id} ans=${q.ans}`)).toEqual([]);
  });

  it("explains every wrong option and leaves the correct one null", () => {
    const bad = [];
    for (const q of all) {
      if (!Array.isArray(q.optExp) || q.optExp.length !== 5) {
        bad.push(`${q._file}#${q.id} optExp length ${q.optExp?.length}`);
        continue;
      }
      if (q.optExp[q.ans] !== null) bad.push(`${q._file}#${q.id} optExp[${q.ans}] should be null`);
      q.optExp.forEach((e, i) => {
        if (i !== q.ans && (typeof e !== "string" || !e.trim())) {
          bad.push(`${q._file}#${q.id} optExp[${i}] empty`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("has non-empty text on every question, option and explanation", () => {
    const bad = [];
    for (const q of all) {
      if (typeof q.q !== "string" || !q.q.trim()) bad.push(`${q._file}#${q.id} empty stem`);
      if (typeof q.exp !== "string" || !q.exp.trim()) bad.push(`${q._file}#${q.id} empty exp`);
      (q.opts || []).forEach((o, i) => {
        if (typeof o !== "string" || !o.trim()) bad.push(`${q._file}#${q.id} opt[${i}] empty`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("has no duplicate options within a question", () => {
    const bad = all.filter(q => new Set((q.opts || []).map(o => o.trim().toLowerCase())).size !== (q.opts || []).length);
    expect(bad.map(q => `${q._file}#${q.id}`)).toEqual([]);
  });

  it("tags every question with the deck it is filed under", () => {
    const bad = [];
    for (const d of decks) {
      for (const q of d.questions) {
        if (q.deck !== d.deck) bad.push(`${d.file}#${q.id} says deck="${q.deck}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("only uses categories the deck declares", () => {
    const bad = [];
    for (const d of decks) {
      const known = new Set(d.categories);
      for (const q of d.questions) {
        if (!known.has(q.cat)) bad.push(`${d.file}#${q.id} cat="${q.cat}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});
