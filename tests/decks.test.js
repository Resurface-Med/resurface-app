import { describe, it, expect } from "vitest";
import { canDropDeck } from "../src/lib/decks.js";

/*
 * The rule behind dragging a deck onto another.
 *
 * It lives in lib rather than in the component because three attempts at
 * this were lost inside drag events, where a predicate answering "no" is
 * indistinguishable from the handler never running: the row greys out and
 * nothing lands either way. Here it can simply be asked.
 */
const forest = [
  { id: "week1", children: [{ id: "upper", children: [{ id: "deep", children: [] }] }] },
  { id: "year2", children: [] },
];

describe("canDropDeck", () => {
  it("allows a deck into another deck", () => {
    expect(canDropDeck(forest, "upper", "year2")).toBe(true);
  });

  /* Already its parent, so the move is a no-op — but refusing it would light
     the row up as forbidden, which reads as a fault rather than as nothing
     to do. */
  it("allows a deck onto the parent it already has", () => {
    expect(canDropDeck(forest, "upper", "week1")).toBe(true);
  });

  it("allows anything out to the top level", () => {
    expect(canDropDeck(forest, "upper", null)).toBe(true);
    expect(canDropDeck(forest, "year2", null)).toBe(true);
  });

  /* The ones that would make a cycle. The database refuses these, so
     allowing the drop would only produce an error. */
  it("refuses a deck into its own child", () => {
    expect(canDropDeck(forest, "week1", "upper")).toBe(false);
  });

  it("refuses a deck into its own grandchild", () => {
    expect(canDropDeck(forest, "week1", "deep")).toBe(false);
  });

  it("refuses a deck onto itself", () => {
    expect(canDropDeck(forest, "upper", "upper")).toBe(false);
  });

  it("refuses when nothing is being dragged", () => {
    expect(canDropDeck(forest, null, "week1")).toBe(false);
    expect(canDropDeck(forest, undefined, null)).toBe(false);
  });
});

import { buildForest } from "../src/lib/decks.js";

/* A featured deck (someone else's, read live) is drawn among yours but is
   not yours: the tree marks it so no menu, drag or rename of yours reaches it. */
describe("buildForest with a featured deck", () => {
  const decks = [
    { id: "mine", name: "Mine", parentId: null, position: 1024 },
    { id: "renal", name: "Renal", parentId: null, position: -1e9, featured: true, byline: "Jacob" },
    { id: "glom", name: "Glomerulus", parentId: "renal", position: 1024, featured: true, byline: null },
  ];
  const questions = [
    { id: 1, path: [{ id: "mine", name: "Mine" }] },
    { id: 2, path: [{ id: "renal", name: "Renal" }, { id: "glom", name: "Glomerulus" }] },
  ];
  const forest = buildForest({ questions, decks, pStats: {}, eligible: new Set([1, 2]) });
  const byId = Object.fromEntries(forest.map(n => [n.id, n]));

  it("keeps your deck yours", () => {
    expect(byId.mine.mine).toBe(true);
    expect(byId.mine.featured).toBeUndefined();
  });
  it("marks the featured deck and its sub-decks as not yours", () => {
    expect(byId.renal.mine).toBe(false);
    expect(byId.renal.featured).toBe(true);
    expect(byId.renal.children[0].mine).toBe(false);
  });
  it("puts the byline on the featured root only", () => {
    expect(byId.renal.byline).toBe("Jacob");
    expect(byId.renal.children[0].byline).toBeNull();
  });
  it("counts its questions like any other deck", () => {
    expect(byId.renal.total).toBe(1);
    expect(byId.renal.avail).toBe(1);
  });
});
