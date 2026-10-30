/**
 * A deck as a file another model can correct, then this app can put back
 * (2026-10-26).
 *
 * The file is one JSON object. Each question keeps its id. `correct` is the
 * text of the right option, copied exactly, so a model that reorders the
 * options does not silently point the old letter at a different answer.
 * A row with no id, or an id from outside this deck, is not inserted: the
 * upload corrects questions, it does not add them. A question missing from
 * the file is left alone, so a file cut short does not delete the rest.
 * A row whose correct answer is not one of its options is skipped whole,
 * rather than saved with the answer on the wrong line.
 */

export const DECK_FILE_FORMAT = 1;

export const DECK_FILE_INSTRUCTIONS = [
  "Correct these questions in place. Return this same JSON object and no other text.",
  "Do not change id, deck, format, or count. Do not add or remove questions.",
  "Each question has exactly 5 options.",
  "correct must be copied exactly, character for character, from one of the options.",
  "why has one entry per option, in the same order. Use an empty string for the correct option.",
  "Change only q, options, correct, exp, and why.",
  "Keep every question. A missing question is not deleted, and it has not been checked.",
].join(" ");

const LETTERS = "ABCDE";

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function pick(row, keys) {
  for (const k of keys) if (row && has(row, k)) return row[k];
  return undefined;
}

function textOf(v) {
  return typeof v === "string" ? v.trim() : "";
}

/** The path from the deck that was downloaded down to the question's own deck. */
export function deckPathLabel(q, rootId) {
  const path = q?.path ?? [];
  const i = path.findIndex(p => p.id === rootId);
  const steps = (i === -1 ? path : path.slice(i)).map(p => p.name).filter(Boolean);
  return steps.join(" / ");
}

function whyOut(q) {
  const n = q.opts?.length ?? 0;
  return Array.from({ length: n }, (_, i) => {
    if (i === q.ans) return "";
    const w = q.optExp?.[i];
    return typeof w === "string" ? w : "";
  });
}

/** The file for one deck, questions in the order they were given. */
export function toDeckFile(deckName, questions, rootId) {
  const list = questions ?? [];
  return {
    format: DECK_FILE_FORMAT,
    deck: deckName,
    count: list.length,
    instructions: DECK_FILE_INSTRUCTIONS,
    questions: list.map(q => ({
      id: q.id,
      deck: deckPathLabel(q, rootId),
      q: q.q ?? "",
      options: [...(q.opts ?? [])],
      correct: q.opts?.[q.ans] ?? "",
      exp: q.exp ?? "",
      why: whyOut(q),
    })),
  };
}

export function serializeDeckFile(file) {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function deckFileName(deckName) {
  const clean = String(deckName ?? "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${clean || "deck"}.json`;
}

function unwrap(text) {
  let raw = String(text ?? "").replace(/^\uFEFF/, "").trim();
  const start = raw.indexOf("```");
  if (start !== -1) {
    let after = raw.slice(start + 3);
    after = after.replace(/^(?:json)?[^\n]*\n/, "");
    const end = after.lastIndexOf("```");
    if (end !== -1) raw = after.slice(0, end).trim();
  }
  return raw;
}

function asQuestions(data) {
  if (Array.isArray(data)) return { questions: data, count: null, deck: null };
  if (data && typeof data === "object" && Array.isArray(data.questions)) {
    return {
      questions: data.questions,
      count: Number.isFinite(Number(data.count)) ? Number(data.count) : data.questions.length,
      deck: typeof data.deck === "string" ? data.deck : null,
      format: data.format,
    };
  }
  return null;
}

/**
 * The file back into questions. A markdown fence, a bare array, one JSON
 * value per line, or the JSON encoded a second time as a string are all
 * read. Anything else is refused whole.
 */
export function parseDeckFile(text) {
  const raw = unwrap(text);
  if (!raw) return { error: "That file is empty." };
  let data;
  try {
    data = JSON.parse(raw);
    if (typeof data === "string") data = JSON.parse(data);
  } catch {
    const lines = raw.split(/\n+/).map(l => l.trim()).filter(l => l && !l.startsWith("```"));
    if (!lines.length || !lines.every(l => l.startsWith("{"))) return { error: "That file isn't the deck JSON." };
    const questions = [];
    const broken = [];
    lines.forEach((l, i) => {
      try {
        const row = JSON.parse(l);
        if (row && row.format != null && row.q == null && row.question == null && !Array.isArray(row.options)) return;
        questions.push(row);
      } catch {
        broken.push(i + 1);
      }
    });
    if (!questions.length) return { error: "That file isn't the deck JSON." };
    return { questions, count: null, deck: null, broken };
  }
  if (data && typeof data === "object" && !Array.isArray(data) && data.format != null && data.format !== DECK_FILE_FORMAT) {
    return { error: "This file is a newer deck format than this app knows." };
  }
  const got = asQuestions(data);
  if (!got) return { error: "That file has no questions." };
  return got;
}

function idOf(row) {
  const n = typeof row?.id === "number" ? row.id : typeof row?.id === "string" && /^\d+$/.test(row.id.trim()) ? Number(row.id.trim()) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function preview(row) {
  const q = textOf(pick(row, ["q", "question", "stem"]));
  return q.length > 80 ? `${q.slice(0, 79)}…` : q;
}

/** Index of `correct`, which may be the option text, a letter, or an index. The text wins. */
export function correctIndex(options, correct) {
  if (typeof correct === "number" && Number.isInteger(correct) && correct >= 0 && correct < options.length) return correct;
  const s = typeof correct === "string" ? correct.trim() : "";
  if (!s) return -1;
  const exact = options.findIndex(o => o === s);
  if (exact !== -1) return exact;
  const stripped = s.replace(/^[A-Ea-e][.)]\s+/, "");
  if (stripped !== s) {
    const at = options.findIndex(o => o === stripped);
    if (at !== -1) return at;
  }
  const letter = s.match(/^([A-Ea-e])(?:[.)])?$/);
  if (letter) {
    const i = LETTERS.indexOf(letter[1].toUpperCase());
    if (i >= 0 && i < options.length) return i;
  }
  if (/^\d+$/.test(s)) {
    const i = Number(s);
    if (i >= 0 && i < options.length) return i;
  }
  return -1;
}

function whyIn(raw, n, ans) {
  if (raw == null) return { keep: true };
  if (!Array.isArray(raw) || raw.length !== n) return { error: "why doesn't line up with the options" };
  const why = [];
  for (let i = 0; i < n; i++) {
    const w = raw[i];
    if (w == null) { why.push(null); continue; }
    if (typeof w !== "string") return { error: "why doesn't line up with the options" };
    why.push(i === ans ? null : (w.trim() || null));
  }
  return { why };
}

/** Old notes follow their option text when the file left `why` out and the options moved. */
function remapWhy(live, options, ans) {
  const map = new Map();
  (live.opts ?? []).forEach((o, i) => { if (!map.has(o)) map.set(o, live.optExp?.[i] ?? null); });
  return options.map((o, i) => (i === ans ? null : (map.get(o) || null)));
}

function normWhy(opts, ans, why) {
  return opts.map((_, i) => {
    if (i === ans) return null;
    const w = why?.[i];
    return typeof w === "string" && w.trim() ? w.trim() : null;
  });
}

function sameQuestion(live, next) {
  const why = normWhy(live.opts ?? [], live.ans, live.optExp);
  return live.q === next.q && live.exp === next.exp && live.ans === next.ans
    && (live.opts ?? []).length === next.opts.length
    && (live.opts ?? []).every((o, i) => o === next.opts[i])
    && why.every((w, i) => (w || null) === (next.optExp[i] || null));
}

/** What of the live question is kept when the file doesn't mention it. */
export function storedPayload(live, next) {
  return {
    q: next.q,
    opts: next.opts,
    ans: next.ans,
    exp: next.exp,
    optExp: next.optExp,
    ...(live.img ? { img: live.img } : {}),
    ...(live.ask ? { ask: live.ask } : {}),
    ...(live.exhibit ? { exhibit: live.exhibit } : {}),
    /* The topic note (2026-10-28) isn't in the file, so it is kept. */
    ...(live.topic ? { topic: live.topic } : {}),
    ...(live.hl ? { hl: live.hl } : {}),
  };
}

function checkRow(row, live) {
  const id = idOf(row);
  if (id == null) return { skip: "no id", q: preview(row) };
  if (!live) return { skip: "not in this deck", id, q: preview(row) };

  const stem = pick(row, ["q", "question", "stem"]);
  const exp = pick(row, ["exp", "explanation"]);
  const optionsRaw = pick(row, ["options", "opts"]);
  const correct = pick(row, ["correct", "answer"]);
  if (stem == null || exp == null || optionsRaw == null || correct == null) {
    return { skip: "a field is missing", id, q: preview(row) || textOf(live.q).slice(0, 80) };
  }
  const q = textOf(stem);
  const explanation = textOf(exp);
  if (!q) return { skip: "the stem is empty", id, q: "" };
  if (!explanation) return { skip: "the explanation is empty", id, q: q.slice(0, 80) };
  if (!Array.isArray(optionsRaw) || optionsRaw.length !== 5) return { skip: "needs exactly 5 options", id, q: q.slice(0, 80) };
  if (optionsRaw.some(o => typeof o !== "string")) return { skip: "an option isn't text", id, q: q.slice(0, 80) };
  const options = optionsRaw.map(o => o.trim());
  if (options.some(o => !o)) return { skip: "an option is empty", id, q: q.slice(0, 80) };
  if (new Set(options).size !== options.length) return { skip: "two options are the same", id, q: q.slice(0, 80) };

  const ans = correctIndex(options, correct);
  if (ans === -1) return { skip: "correct doesn't match any option", id, q: q.slice(0, 80) };

  const notes = whyIn(pick(row, ["why", "optExp", "why_wrong"]), options.length, ans);
  if (notes.error) return { skip: notes.error, id, q: q.slice(0, 80) };
  const optExp = notes.keep ? remapWhy(live, options, ans) : notes.why;
  const next = { q, opts: options, ans, exp: explanation, optExp };
  return { id, payload: storedPayload(live, next), changed: !sameQuestion(live, next), q: q.slice(0, 80) };
}

/**
 * Which rows of a parsed file can be written onto this deck.
 * `updates` are the ones that actually differ. The last copy of a repeated
 * id is the one that counts.
 */
export function planDeckUpdate(parsed, liveQuestions) {
  const byId = new Map((liveQuestions ?? []).map(q => [q.id, q]));
  const skipped = [];
  const order = [];
  const last = new Map();
  let repeated = 0;
  (parsed?.questions ?? []).forEach(row => {
    const id = idOf(row);
    if (id == null) {
      skipped.push(checkRow(row, null));
      return;
    }
    if (last.has(id)) repeated += 1;
    else order.push(id);
    last.set(id, row);
  });

  const updates = [];
  let unchanged = 0;
  for (const id of order) {
    const got = checkRow(last.get(id), byId.get(id) ?? null);
    if (got.skip) skipped.push(got);
    else if (!got.changed) unchanged += 1;
    else updates.push({ id: got.id, payload: got.payload, featured: Boolean(byId.get(id)?.featured) });
  }
  /* In the file and in this deck, whether or not the row was usable.
     A skipped row was seen. A question never mentioned was not. */
  const mentioned = new Set(order.filter(id => byId.has(id)));
  const declared = parsed?.count == null ? null : Number(parsed.count);
  return {
    updates,
    skipped,
    unchanged,
    repeated,
    missing: (liveQuestions ?? []).filter(q => !mentioned.has(q.id)).length,
    total: (liveQuestions ?? []).length,
    inFile: mentioned.size,
    received: parsed?.questions?.length ?? 0,
    truncated: declared != null && declared > (parsed?.questions?.length ?? 0),
    declared,
    broken: parsed?.broken ?? [],
  };
}
