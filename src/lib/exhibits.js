/**
 * Data exhibits (2026-10-20): the tables a question shows between its stem
 * and its options — an ABG, U&Es, LFTs, CSF, a 2×2 table — the way UKMLA
 * and USMLE papers show them.
 *
 * A question may carry `exhibit`:
 *
 *   { kind: "labs", title: "Arterial blood gas (on air)",
 *     rows: [{ name: "pH", value: "7.27", unit: "", range: "7.35 – 7.45" }, …],
 *     note: "optional line under the table" }
 *
 *   { kind: "table", title: "…", columns: ["", "DVT present", "DVT absent"],
 *     rows: [["Test positive", "80", "30"], …] }
 *
 * Values are strings, written as the exam writes them. No high/low flags:
 * marking what is abnormal answers half the question.
 *
 * `checkExhibit` is why exhibits are data rather than pictures: an exhibit
 * that cannot be true is caught before it is saved. A blood gas whose pH
 * does not follow from its PaCO₂ and bicarbonate, a value outside what a
 * living patient can have, a stated anion gap that does not add up — each
 * is a problem listed by name. Pure, so it can be tested.
 */

const num = v => {
  const m = String(v ?? "").replace(/[<>≤≥~]/g, "").replace(/−/g, "-").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const key = name => String(name ?? "").toLowerCase().replace(/[₂2]/g, "2").replace(/[^a-z0-9]/g, "");

/* Find a row by any of its usual names. */
function find(rows, ...names) {
  const want = names.map(key);
  const r = rows.find(r => want.includes(key(r.name)));
  return r ? num(r.value) : null;
}

/* What a living patient can have, roughly — wide on purpose: this is to
   catch a decimal point in the wrong place, not to judge the medicine. */
const BOUNDS = [
  [["ph"], 6.8, 7.8],
  [["paco2", "pco2"], 1.5, 15],
  [["pao2", "po2"], 2, 70],
  [["bicarbonate", "hco3", "standardbicarbonate"], 2, 60],
  [["sodium", "na"], 100, 185],
  [["potassium", "k"], 1.5, 10],
  [["chloride", "cl"], 60, 140],
  [["urea"], 0.5, 80],
  [["creatinine"], 15, 2500],
  [["glucose", "plasmaglucose", "capillaryglucose", "fastingglucose"], 0.5, 80],
  [["haemoglobin", "hb"], 30, 250],
  [["calcium", "adjustedcalcium", "correctedcalcium"], 1, 5],
];

export function checkExhibit(ex) {
  const problems = [];
  if (!ex || typeof ex !== "object") return ["No exhibit."];
  if (!ex.title || typeof ex.title !== "string") problems.push("It has no title.");

  if (ex.kind === "table") {
    const cols = ex.columns ?? [];
    if (!Array.isArray(cols) || cols.length < 2) problems.push("A table needs at least two columns.");
    if (!Array.isArray(ex.rows) || !ex.rows.length) problems.push("A table needs rows.");
    else if (ex.rows.some(r => !Array.isArray(r) || r.length !== cols.length)) problems.push("Every row needs one cell per column.");
    return problems;
  }
  if (ex.kind !== "labs") return [...problems, `Unknown exhibit kind "${ex.kind}".`];

  const rows = ex.rows ?? [];
  if (!rows.length) return [...problems, "It has no results."];
  if (rows.some(r => !r || !r.name || r.value === undefined || r.value === "")) problems.push("Every result needs a name and a value.");

  for (const [names, lo, hi] of BOUNDS) {
    const v = find(rows, ...names);
    if (v != null && (v < lo || v > hi)) problems.push(`${names[0]} of ${v} is not possible in a living patient.`);
  }

  /* Henderson–Hasselbalch, in kPa: pH = 6.1 + log10(HCO₃ / (0.23 × PaCO₂)). */
  const ph = find(rows, "pH");
  const co2 = find(rows, "PaCO2", "pCO2");
  const hco3 = find(rows, "Bicarbonate", "HCO3", "Standard bicarbonate");
  if (ph != null && co2 != null && hco3 != null && co2 > 0 && hco3 > 0) {
    const expected = 6.1 + Math.log10(hco3 / (0.23 * co2));
    if (Math.abs(expected - ph) > 0.06) {
      problems.push(`The pH does not follow from the PaCO₂ and bicarbonate: they give ${expected.toFixed(2)}, not ${ph}.`);
    }
  }

  /* A stated anion gap must add up: Na − (Cl + HCO₃), give or take. */
  const gap = find(rows, "Anion gap");
  const na = find(rows, "Sodium", "Na"), cl = find(rows, "Chloride", "Cl");
  if (gap != null && na != null && cl != null && hco3 != null) {
    const k = find(rows, "Potassium", "K") ?? 0;
    const a = na - (cl + hco3), b = na + k - (cl + hco3);
    if (Math.abs(gap - a) > 2 && Math.abs(gap - b) > 2) problems.push(`The anion gap does not add up: Na − (Cl + HCO₃) is ${a.toFixed(1)}.`);
  }
  return problems;
}

/* The exhibit as plain text, for the AI that explains a question. */
export function exhibitText(ex) {
  if (!ex) return "";
  if (ex.kind === "table") {
    return [ex.title, (ex.columns ?? []).join(" | "), ...(ex.rows ?? []).map(r => r.join(" | ")), ex.note].filter(Boolean).join("\n");
  }
  return [
    ex.title,
    ...(ex.rows ?? []).map(r => `${r.name}: ${r.value}${r.unit ? ` ${r.unit}` : ""}${r.range ? ` (normal ${r.range})` : ""}`),
    ex.note,
  ].filter(Boolean).join("\n");
}
