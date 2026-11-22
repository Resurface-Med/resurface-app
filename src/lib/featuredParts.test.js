import { describe, expect, it } from "vitest";
import { composeParts, partsKey, validParts } from "./featuredParts";

const shard = (id, topics, questions) => ({
  root: { id, top: "year", byline: "Rafil", position: 0 },
  decks: [{ id: `${id}-deck`, name: id, root: id, parentId: null, position: 0 }],
  topics,
  questions,
});

describe("composeParts", () => {
  it("puts shards together in order, moving each topic index past the shards before it", () => {
    const a = shard("a", [{ title: "A0" }, { title: "A1" }], [{ id: 1, deckId: "a-deck", payload: {}, t: 1 }]);
    const b = shard("b", [{ title: "B0" }], [{ id: 2, deckId: "b-deck", payload: {}, t: 0 }, { id: 3, deckId: "b-deck", payload: {} }]);
    const out = composeParts(7, [a, b]);
    expect(out.version).toBe(7);
    expect(out.roots.map(r => r.id)).toEqual(["a", "b"]);
    expect(out.topics.map(t => t.title)).toEqual(["A0", "A1", "B0"]);
    expect(out.questions).toEqual([
      { id: 1, deckId: "a-deck", payload: {}, t: 1 },
      { id: 2, deckId: "b-deck", payload: {}, t: 2 },
      { id: 3, deckId: "b-deck", payload: {} },
    ]);
    expect(out.topics[out.questions[1].t].title).toBe("B0");
  });
});

describe("partsKey and validParts", () => {
  it("changes when any piece's hash does", () => {
    const p = [{ root: "a", hash: "1" }, { root: "b", hash: "2" }];
    expect(partsKey(p)).not.toBe(partsKey([p[0], { root: "b", hash: "3" }]));
  });
  it("wants a non-empty list of roots with hashes", () => {
    expect(validParts([{ root: "a", hash: "1" }])).toBe(true);
    expect(validParts([])).toBe(false);
    expect(validParts(null)).toBe(false);
    expect(validParts([{ root: "a" }])).toBe(false);
  });
});
