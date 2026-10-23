import { describe, it, expect } from "vitest";
import { shelve, buildForest, findNode } from "../src/lib/decks";

/* A deck of yours filed under a ready-made heading ("Year 2"), which has
   no deck row: drawn inside it, while really at your top level. */
const featured = [
  { id: "y2", name: "Year 2", parentId: null, position: -1e9, featured: true, root: "renal", folder: true },
  { id: "renal", name: "Renal", parentId: "y2", position: 0, featured: true, root: "renal" },
];

describe("shelve", () => {
  it("hangs a shelved top-level deck from its heading, by name, any case", () => {
    const [d] = shelve([{ id: "ex", name: "Exhibits", parentId: null, shelf: "year 2" }], featured);
    expect(d.parentId).toBe("y2");
  });
  it("leaves it at the top when the heading is not on screen", () => {
    const [d] = shelve([{ id: "ex", name: "Exhibits", parentId: null, shelf: "Year 3" }], featured);
    expect(d.parentId).toBe(null);
  });
  it("ignores shelf on a deck that has a real parent", () => {
    const [d] = shelve([{ id: "ex", name: "Exhibits", parentId: "mine", shelf: "Year 2" }], featured);
    expect(d.parentId).toBe("mine");
  });
  it("marks it yours and shelved in the tree; one inside a real deck is yours only", () => {
    const own = shelve([
      { id: "ex", name: "Exhibits", parentId: null, shelf: "Year 2", position: 1 },
      { id: "extra", name: "Renal extras", parentId: "renal", position: 1 },
    ], featured);
    const forest = buildForest({ questions: [], decks: [...own, ...featured], pStats: {}, eligible: new Set() });
    const ex = findNode(forest, "ex"), extra = findNode(forest, "extra");
    expect(findNode(forest, "y2").children.map(n => n.id)).toContain("ex");
    expect([ex.yours, ex.shelved, ex.mine]).toEqual([true, true, true]);
    expect([extra.yours, Boolean(extra.shelved)]).toEqual([true, false]);
  });
});
