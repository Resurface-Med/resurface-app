/**
 * Questions uploaded as a JSON file (2026-11-02), for the admin team to add
 * to a deck from its ⋯ menu.
 *
 * Takes the same shape Download deck gives you — { questions: [{ q,
 * options, correct, exp, why }] } — so a downloaded deck can be edited and
 * sent back as new questions, or a bare array of those. The app's own shape
 * ({ q, opts, ans, exp, optExp }) is read too. `correct` is the text of the
 * right option; an index or a letter (A–E) works as well.
 *
 * Returns { drafts, problems }: drafts in the app's shape, and for each row
 * that couldn't be used, its number and why, so nothing is dropped quietly.
 */

export const UPLOAD_EXAMPLE = {
  questions: [
    {
      q: "Which enzyme converts T4 to T3 in peripheral tissues?",
      options: ["Deiodinase", "Thyroid peroxidase", "5-alpha reductase", "Aromatase", "Carbonic anhydrase"],
      correct: "Deiodinase",
      exp: "Deiodinases remove an iodine from T4 to make the more active T3.",
      why: ["", "Thyroid peroxidase iodinates thyroglobulin in the gland.", "5-alpha reductase converts testosterone to DHT.", "Aromatase converts androgens to oestrogens.", "Carbonic anhydrase makes carbonic acid from CO2 and water."],
    },
  ],
};

const text = v => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const first = (row, keys) => { for (const k of keys) if (row && row[k] !== undefined && row[k] !== null) return row[k]; return undefined; };

function answerIndex(row, opts) {
  const c = first(row, ["correct", "answer", "ans", "correctAnswer"]);
  if (typeof c === "number" && Number.isInteger(c) && c >= 0 && c < opts.length) return c;
  const s = text(c);
  if (!s) return -1;
  if (/^[A-Ea-e]$/.test(s)) { const i = s.toUpperCase().charCodeAt(0) - 65; return i < opts.length ? i : -1; }
  const exact = opts.findIndex(o => o === s);
  if (exact !== -1) return exact;
  return opts.findIndex(o => o.toLowerCase() === s.toLowerCase());
}

export function parseQuestionFile(raw) {
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return { drafts: [], problems: [{ row: 0, why: "This isn't valid JSON." }] }; }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!rows) return { drafts: [], problems: [{ row: 0, why: "Expected a list of questions, or { \"questions\": [...] }." }] };
  const drafts = [], problems = [];
  rows.forEach((row, i) => {
    const n = i + 1;
    const q = text(first(row, ["q", "question", "stem"]));
    const optsRaw = first(row, ["options", "opts", "choices"]);
    const opts = Array.isArray(optsRaw) ? optsRaw.map(text) : [];
    if (!q) { problems.push({ row: n, why: "It has no question text." }); return; }
    if (opts.length < 2 || opts.some(o => !o)) { problems.push({ row: n, why: "It needs at least two options, none of them blank." }); return; }
    if (new Set(opts.map(o => o.toLowerCase())).size !== opts.length) { problems.push({ row: n, why: "Two of its options are the same." }); return; }
    const ans = answerIndex(row, opts);
    if (ans === -1) { problems.push({ row: n, why: "Its correct answer isn't one of its options." }); return; }
    const whyRaw = first(row, ["why", "optExp", "optionExplanations"]);
    const optExp = opts.map((_, k) => (k === ans ? null : (Array.isArray(whyRaw) ? text(whyRaw[k]) || null : null)));
    drafts.push({ q, opts, ans, exp: text(first(row, ["exp", "explanation"])), optExp });
  });
  return { drafts, problems };
}
