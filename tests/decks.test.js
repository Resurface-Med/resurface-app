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
