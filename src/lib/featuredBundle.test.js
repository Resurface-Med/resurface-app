import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./offlineStore", () => ({ readBundle: async () => null, saveBundle: async () => true }));

const { assembleFeatured, liteFeatured } = await import("./remote");
const { GEN_ID_BASE } = await import("../data");

const bundle = {
  version: 7,
  roots: [
    { id: "A", top: "F", byline: "Rafil", position: 0, shareCode: "aaa" },
    { id: "B", top: "B", byline: "Jacob", position: 1, shareCode: "bbb" },
  ],
  decks: [
    { id: "F", name: "Year 1", position: 0, root: "A", parentId: null },
    { id: "A", name: "Resp", position: 0, root: "A", parentId: "F" },
    { id: "A1", name: "Asthma", position: 1, root: "A", parentId: "A" },
    { id: "B", name: "Renal", position: 1, root: "B", parentId: null },
  ],
  topics: [{ title: "Asthma", body: "Airways." }],
  questions: [
    { id: 1, deckId: "A1", payload: { q: "q1", ans: 0 }, t: 0 },
    { id: 2, deckId: "A1", payload: { q: "q2", ans: 1 } },
    { id: 3, deckId: "B", payload: { q: "q3", ans: 2, gen: true } },
  ],
};
const mine = {
  version: 7,
  roots: [{ id: "A", mine: false, hidden: true, copyId: null }, { id: "B", mine: false, hidden: false, copyId: "c1" }],
  extra: { roots: [], decks: [], questions: [] },
};

describe("assembleFeatured", () => {
  it("puts each question's note back from the shared list", () => {
    const f = assembleFeatured(bundle, mine);
    const q1 = f.questions.find(q => q.id === GEN_ID_BASE + 1);
    expect(q1.topic).toEqual({ title: "Asthma", body: "Airways." });
    expect(f.questions.find(q => q.id === GEN_ID_BASE + 2).topic).toBeUndefined();
  });

  it("merges the per-person part and keeps the featured shape", () => {
    const f = assembleFeatured(bundle, mine);
    expect(f.roots.map(r => [r.id, r.hidden, r.copyId, r.name])).toEqual([["A", true, null, "Year 1"], ["B", false, "c1", "Renal"]]);
    expect(f.questions.every(q => q.featured && !q.gen)).toBe(true);
    expect(f.version).toBe(7);
  });

  it("leaves out decks you should not see (your own, unless the owner sees it)", () => {
    const f = assembleFeatured(bundle, { ...mine, roots: [mine.roots[1]] });
    expect(f.roots.map(r => r.id)).toEqual(["B"]);
    expect(f.decks.map(d => d.id)).toEqual(["B"]);
    expect(f.questions.map(q => q.id - GEN_ID_BASE)).toEqual([3]);
  });

  it("adds an unlisted deck shared with you", () => {
    const extra = {
      roots: [{ id: "X", top: "X", byline: "Rayan", position: 4, shareCode: null, mine: false, hidden: false, copyId: null }],
      decks: [{ id: "X", name: "Endo", position: 4, root: "X", parentId: null }],
      questions: [{ id: 9, deckId: "X", payload: { q: "q9" } }],
    };
    const f = assembleFeatured(bundle, { ...mine, extra });
    expect(f.roots.map(r => r.id)).toEqual(["A", "B", "X"]);
    expect(f.questions.some(q => q.id === GEN_ID_BASE + 9)).toBe(true);
  });
});

describe("liteFeatured", () => {
  it("keeps the version and per-person part, with hides made since, and no questions", () => {
    const f = assembleFeatured(bundle, mine);
    f.roots = f.roots.map(r => (r.id === "B" ? { ...r, hidden: true } : r));
    const lite = liteFeatured(f);
    expect(lite.lite).toBe(true);
    expect(lite.version).toBe(7);
    expect(lite.questions).toBeUndefined();
    expect(lite.mine.roots.find(r => r.id === "B").hidden).toBe(true);
    const back = assembleFeatured(bundle, lite.mine);
    expect(back.roots.find(r => r.id === "B").hidden).toBe(true);
    expect(back.questions.length).toBe(3);
  });

  it("passes through a copy from before (no version)", () => {
    const old = { roots: [], decks: [], questions: [{ id: 1 }] };
    expect(liteFeatured(old)).toBe(old);
  });
});
