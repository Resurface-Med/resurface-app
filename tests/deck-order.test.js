import { describe, it, expect } from "vitest";
import {
  STEP, compareDecks, moveDeckTo, nextPosition, stepMove,
  visibleRows, projectGap, homeGap, sameSpot,
} from "../src/lib/deckOrder.js";

const deck = (id, parentId, position, name = id) => ({ id, parentId, position, name, createdAt: "2026-10-01" });

/* A
 *   a1
 *   a2
 *     x
 * B
 * C            */
const decks = [
  deck("A", null, 1 * STEP), deck("B", null, 2 * STEP), deck("C", null, 3 * STEP),
  deck("a1", "A", 1 * STEP), deck("a2", "A", 2 * STEP), deck("x", "a2", STEP),
];

function forestOf(rows, parentId = null, depth = 0) {
  return rows.filter(d => (d.parentId ?? null) === parentId).sort(compareDecks)
    .map(d => ({ id: d.id, name: d.name, depth, children: forestOf(rows, d.id, depth + 1) }));
}
const order = (rows, parentId = null) => rows.filter(d => (d.parentId ?? null) === parentId).sort(compareDecks).map(d => d.id);

describe("moveDeckTo", () => {
  it("reorders among siblings with one write", () => {
    const r = moveDeckTo(decks, "C", null, "A");
    expect(order(r.decks)).toEqual(["C", "A", "B"]);
    expect(r.changes).toHaveLength(1);
  });

  it("moves to the end of a parent", () => {
    const r = moveDeckTo(decks, "A", null, null);
    expect(order(r.decks)).toEqual(["B", "C", "A"]);
  });

  it("re-parents, between two children", () => {
    const r = moveDeckTo(decks, "C", "A", "a2");
    expect(order(r.decks, "A")).toEqual(["a1", "C", "a2"]);
    expect(r.changes[0].patch.parent_id).toBe("A");
  });

  it("refuses a move into itself or beneath itself", () => {
    expect(moveDeckTo(decks, "A", "A", null)).toBeNull();
    expect(moveDeckTo(decks, "A", "x", null)).toBeNull();
  });

  it("writes nothing for a move to where it already is", () => {
    expect(moveDeckTo(decks, "B", null, "C").changes).toEqual([]);
    expect(moveDeckTo(decks, "C", null, null).changes).toEqual([]);
  });

  it("renumbers when neighbours have no room between them", () => {
    const tight = [deck("p", null, 5), deck("q", null, 6), deck("r", null, 7)];
    const res = moveDeckTo(tight, "r", null, "q");
    expect(order(res.decks)).toEqual(["p", "r", "q"]);
    expect(new Set(res.decks.map(d => d.position)).size).toBe(3);
  });

  it("orders ties by name, and breaks them when moving between", () => {
    const tied = [deck("z", null, 0, "Zeta"), deck("y", null, 0, "Alpha"), deck("w", null, 0, "Mid")];
    expect(order(tied)).toEqual(["y", "w", "z"]);
    const res = moveDeckTo(tied, "z", null, "w");
    expect(order(res.decks)).toEqual(["y", "z", "w"]);
  });

  it("survives many moves into the same slot", () => {
    let rows = [deck("p", null, STEP), deck("q", null, 2 * STEP)];
    for (let i = 0; i < 40; i++) {
      rows = [...rows, deck(`n${i}`, null, nextPosition(rows))];
      rows = moveDeckTo(rows, `n${i}`, null, "q").decks;
    }
    const o = order(rows);
    expect(o[0]).toBe("p");
    expect(o[o.length - 1]).toBe("q");
    expect(o.slice(1, -1)).toEqual(Array.from({ length: 40 }, (_, i) => `n${i}`));
  });
});

describe("stepMove", () => {
  const f = forestOf(decks);
  it("goes up and down among siblings", () => {
    expect(stepMove(f, "B", "up")).toEqual({ parentId: null, beforeId: "A" });
    expect(stepMove(f, "B", "down")).toEqual({ parentId: null, beforeId: null });
    expect(stepMove(f, "A", "up")).toBeNull();
    expect(stepMove(f, "C", "down")).toBeNull();
  });
  it("goes in to the deck above, and out beside its parent", () => {
    expect(stepMove(f, "B", "in")).toEqual({ parentId: "A", beforeId: null });
    expect(stepMove(f, "a1", "out")).toEqual({ parentId: null, beforeId: "B" });
    expect(stepMove(f, "A", "out")).toBeNull();
  });
  it("does not leave the floor", () => {
    expect(stepMove(f[0].children, "a1", "out", "A")).toBeNull();
  });
});

describe("drag projection", () => {
  const f = forestOf(decks);
  const allOpen = new Set(["A", "a2"]);

  it("starts where the deck already is", () => {
    for (const id of ["A", "a1", "a2", "x", "B", "C"]) {
      const g = homeGap(f, allOpen, id);
      const here = decks.find(d => d.id === id);
      const sibs = order(decks, here.parentId);
      expect(g.parentId).toBe(here.parentId);
      expect(g.beforeId).toBe(sibs[sibs.indexOf(id) + 1] ?? null);
    }
  });

  it("an only child's home is still inside its parent", () => {
    const g = homeGap(f, allOpen, "x");
    expect(g).toMatchObject({ parentId: "a2", beforeId: null, depth: 2 });
  });

  it("under an open deck, is its first child", () => {
    const rows = visibleRows(f, allOpen, { excludeId: "C" });
    expect(projectGap(rows, 1, 0)).toMatchObject({ parentId: "A", beforeId: "a1", depth: 1 });
  });

  it("after the last of a run, picks a depth by sideways movement", () => {
    const rows = visibleRows(f, allOpen, { excludeId: "C" }); // A a1 a2 x B
    const g = rows.findIndex(r => r.id === "B");
    expect(projectGap(rows, g, 2)).toMatchObject({ parentId: "a2", beforeId: null });
    expect(projectGap(rows, g, 1)).toMatchObject({ parentId: "A", beforeId: null });
    expect(projectGap(rows, g, 0)).toMatchObject({ parentId: null, beforeId: "B" });
    expect(projectGap(rows, g, 9).depth).toBe(2);
    expect(projectGap(rows, g, -3).depth).toBe(0);
  });

  it("at the very end, can land at any depth up the last chain", () => {
    const rows = visibleRows(f, allOpen, { excludeId: "C" });
    expect(projectGap(rows, rows.length, 0)).toMatchObject({ parentId: null, beforeId: null });
  });

  it("works under a tab whose root is not drawn", () => {
    const tab = f[0].children; // a1, a2 > x, at depth 1
    const rows = visibleRows(tab, allOpen, { excludeId: "a1", rootParentId: "A" });
    expect(projectGap(rows, rows.length, 1, 1, "A")).toMatchObject({ parentId: "A", beforeId: null });
    expect(projectGap(rows, 0, 1, 1, "A")).toMatchObject({ parentId: "A", beforeId: "a2" });
  });

  it("compares spots", () => {
    expect(sameSpot({ parentId: null, beforeId: "B" }, { parentId: null, beforeId: "B", depth: 0 })).toBe(true);
    expect(sameSpot({ parentId: null, beforeId: "B" }, null)).toBe(false);
  });
});
