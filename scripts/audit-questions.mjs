import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";

const client = new Anthropic();

const src = readFileSync("src/data/questions.js", "utf8");
const arrayMatch = src.match(/export const QUESTIONS\s*=\s*(\[[\s\S]*?\n\];)/);
const qs = eval(arrayMatch[1]);

const BATCH_SIZE = 5; // questions per API call to keep prompts manageable
const DELAY_MS = 500; // rate limit buffer

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function auditBatch(batch) {
  const payload = batch.map((q) => ({
    id: q.id,
    q: q.q,
    opts: q.opts,
    ans: q.ans,
    exp: q.exp,
    optExp: q.optExp,
  }));

  const prompt = `You are auditing a medical school quiz question bank for a Year 1 MBChB course.
A script previously reordered the opts arrays but failed to update ans (the correct answer index) or optExp (per-option explanations).
The exp field is ALWAYS factually correct — trust it as ground truth.

For EACH question below:
1. Read exp carefully to determine which opts[i] is the correct answer.
2. If opts[ans] does NOT match exp, identify the correct index.
3. Reorder optExp so: optExp[correct_index] = null, and all other optExp entries are positioned to describe their corresponding opts[i].
   - The optExp descriptions may themselves be mismatched with opts — realign them based on what each description is actually explaining.
4. If opts[ans] already matches exp, output "OK".

Return ONLY valid JSON array, no prose, no markdown fences. Format:
[
  { "id": <id>, "status": "OK" },
  { "id": <id>, "status": "FIXED", "ans": <new_ans_index>, "optExp": [<array with null at correct index>] },
  ...
]

Questions:
${JSON.stringify(payload, null, 2)}`;

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].text.trim();
  // Strip any accidental markdown fences
  const json = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json);
}

function serOptExp(arr) {
  const items = arr.map((e) => (e === null ? "null" : JSON.stringify(e)));
  return "[" + items.join(",") + "]";
}

async function main() {
  console.log(`Auditing ${qs.length} questions with Claude Opus...\n`);

  const allFixes = [];
  const errors = [];

  for (let i = 0; i < qs.length; i += BATCH_SIZE) {
    const batch = qs.slice(i, i + BATCH_SIZE);
    const batchNums = batch.map((q) => q.id).join(", ");
    process.stdout.write(
      `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(qs.length / BATCH_SIZE)} (ids: ${batchNums})... `
    );

    try {
      const results = await auditBatch(batch);
      const fixes = results.filter((r) => r.status === "FIXED");
      const oks = results.filter((r) => r.status === "OK");
      console.log(`OK:${oks.length} FIXED:${fixes.length}`);
      allFixes.push(...fixes);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errors.push({ batch: batchNums, error: e.message });
    }

    if (i + BATCH_SIZE < qs.length) await sleep(DELAY_MS);
  }

  console.log(
    `\nAudit complete. Fixes needed: ${allFixes.length}, Errors: ${errors.length}`
  );

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log(`  Batch ${e.batch}: ${e.error}`));
  }

  if (allFixes.length === 0) {
    console.log("No fixes needed — database is clean.");
    return;
  }

  console.log("\nFixes:");
  allFixes.forEach((f) => {
    const q = qs.find((x) => x.id === f.id);
    console.log(
      `  id:${f.id} ans:${q.ans}->${f.ans} opts[${f.ans}]="${q.opts[f.ans]}"`
    );
  });

  // Validate fixes before applying
  let valid = true;
  for (const fix of allFixes) {
    if (fix.optExp.filter((e) => e === null).length !== 1) {
      console.log(`INVALID null count for id:${fix.id}`);
      valid = false;
    }
    if (fix.optExp[fix.ans] !== null) {
      console.log(`INVALID ans/null mismatch for id:${fix.id}`);
      valid = false;
    }
    const q = qs.find((x) => x.id === fix.id);
    if (fix.optExp.length !== q.opts.length) {
      console.log(`INVALID optExp length for id:${fix.id}`);
      valid = false;
    }
  }

  if (!valid) {
    console.log("\nValidation failed — not writing. Check errors above.");
    return;
  }

  // Apply fixes
  let content = readFileSync("src/data/questions.js", "utf8");
  let applied = 0;

  for (const fix of allFixes) {
    const q = qs.find((x) => x.id === fix.id);
    const qLine = "{ id:" + fix.id + ",";
    const lineStart = content.indexOf(qLine);
    if (lineStart === -1) {
      console.log(`Cannot find id:${fix.id} in file`);
      continue;
    }
    const lineEnd = content.indexOf("\n", lineStart);
    const line = content.slice(lineStart, lineEnd);

    const oldAns = "ans:" + q.ans;
    const newAns = "ans:" + fix.ans;
    const oldOptExp = "optExp: " + serOptExp(q.optExp);
    const newOptExp = "optExp: " + serOptExp(fix.optExp);

    let newLine = line.replace(oldAns, newAns).replace(oldOptExp, newOptExp);
    if (newLine === line) {
      console.log(`No change applied for id:${fix.id} — pattern mismatch`);
      continue;
    }

    content = content.slice(0, lineStart) + newLine + content.slice(lineEnd);
    applied++;
  }

  writeFileSync("src/data/questions.js", content);
  console.log(`\nApplied ${applied}/${allFixes.length} fixes to questions.js`);
}

main().catch(console.error);
