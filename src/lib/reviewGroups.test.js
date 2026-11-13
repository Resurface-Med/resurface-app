import { describe, it, expect } from "vitest";
import { reviewGroups, allKeys, idsFor } from "./reviewGroups";

const p = (...names) => names.map(n => ({ id: n.toLowerCase(), name: n }));

describe("reviewGroups", () => {
  it("skips a level every question shares", () => {
    const g = reviewGroups([
      { id: 1, path: p("Year 2", "Renal", "AKI") },
      { id: 2, path: p("Year 2", "Renal", "CKD") },
      { id: 3, path: p("Year 2", "Respiratory", "Asthma") },
    ]);
    expect(g.map(x => x.name)).toEqual(["Renal", "Respiratory"]);
    expect(g[0].children.map(c => c.name)).toEqual(["AKI", "CKD"]);
    expect(g[0].count).toBe(2);
  });

  it("goes down to lectures when everything is in one topic", () => {
    const g = reviewGroups([
      { id: 1, path: p("Year 2", "Respiratory", "Asthma") },
      { id: 2, path: p("Year 2", "Respiratory", "COPD") },
    ]);
    expect(g.map(x => x.name)).toEqual(["Asthma", "COPD"]);
  });

  it("keeps questions in a topic's own deck as a child under its name", () => {
    const g = reviewGroups([
      { id: 1, path: p("Mine", "Renal") },
      { id: 2, path: p("Mine", "Renal", "AKI") },
      { id: 3, path: p("Mine", "Cardio") },
    ]);
    const renal = g.find(x => x.name === "Renal");
    expect(renal.children.map(c => c.name)).toEqual(["AKI", "Renal"]);
    expect(renal.count).toBe(2);
  });

  it("returns only the ticked questions", () => {
    const g = reviewGroups([
      { id: 1, path: p("Y", "A", "a1") },
      { id: 2, path: p("Y", "A", "a2") },
      { id: 3, path: p("Y", "B", "b1") },
    ]);
    expect(idsFor(g, new Set(allKeys(g))).sort()).toEqual([1, 2, 3]);
    expect(idsFor(g, new Set(["a/a1", "b/b1"])).sort()).toEqual([1, 3]);
  });

  it("is empty for nothing due", () => {
    expect(reviewGroups([])).toEqual([]);
  });
});
