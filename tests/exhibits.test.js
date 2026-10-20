import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkExhibit, exhibitText } from "../src/lib/exhibits.js";

const deck = JSON.parse(readFileSync(new URL("../content/exhibits/test-deck.json", import.meta.url), "utf8"));
const abg = (ph, co2, hco3) => ({
  kind: "labs", title: "ABG",
  rows: [{ name: "pH", value: String(ph) }, { name: "PaCO₂", value: String(co2), unit: "kPa" }, { name: "Bicarbonate", value: String(hco3) }],
});

describe("checkExhibit", () => {
  it("passes a blood gas that adds up, and catches one that cannot be true", () => {
    expect(checkExhibit(abg(7.27, 8.9, 30))).toEqual([]);
    expect(checkExhibit(abg(7.40, 8.9, 30))[0]).toMatch(/pH does not follow/);
  });
  it("catches values no living patient has — a misplaced decimal point", () => {
    const ex = { kind: "labs", title: "U&E", rows: [{ name: "Potassium", value: "69" }] };
    expect(checkExhibit(ex)[0]).toMatch(/potassium of 69/);
  });
  it("checks a stated anion gap", () => {
    const rows = [{ name: "Sodium", value: "140" }, { name: "Chloride", value: "100" }, { name: "Bicarbonate", value: "24" }];
    expect(checkExhibit({ kind: "labs", title: "x", rows: [...rows, { name: "Anion gap", value: "16" }] })).toEqual([]);
    expect(checkExhibit({ kind: "labs", title: "x", rows: [...rows, { name: "Anion gap", value: "30" }] })[0]).toMatch(/anion gap/);
  });
  it("checks a table's shape", () => {
    expect(checkExhibit({ kind: "table", title: "t", columns: ["", "a", "b"], rows: [["x", "1"]] })[0]).toMatch(/one cell per column/);
    expect(checkExhibit({ kind: "chart", title: "t" })[0]).toMatch(/Unknown exhibit kind/);
  });
  it("reads as plain text for the AI", () => {
    expect(exhibitText(abg(7.27, 8.9, 30))).toBe("ABG\npH: 7.27\nPaCO₂: 8.9 kPa\nBicarbonate: 30");
  });
});

describe("the test deck", () => {
  it("every exhibit passes its own checks", () => {
    for (const q of deck) expect([q.q.slice(0, 40), checkExhibit(q.exhibit)]).toEqual([q.q.slice(0, 40), []]);
  });
  it("every question is a well-formed single best answer", () => {
    for (const q of deck) {
      expect(q.opts).toHaveLength(5);
      expect(q.ans).toBeGreaterThanOrEqual(0);
      expect(q.optExp).toHaveLength(5);
      expect(q.optExp[q.ans]).toBeNull();
      expect(new Set(q.opts).size).toBe(5);
    }
  });
});
