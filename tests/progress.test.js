import { describe, it, expect } from "vitest";
import { seenCount, masteredCount, share, buildTree, leavesUnder, pctOf } from "../src/lib/progress.js";

const qs = (...ids) => ids.map(id => ({ id }));

describe("seenCount", () => {
  it("counts the questions you have, not the rows you kept", () => {
    const questions = qs(1, 2, 3);
    /* Progress from questions that are gone — a deleted deck, or the bank the
       app no longer ships. This is the case that produced "100 of 20". */
    const pStats = { 1: {}, 2: {}, 900: {}, 901: {}, 902: {} };
    expect(seenCount(questions, pStats)).toBe(2);
  });

  it("can never exceed the number of questions", () => {
    const questions = qs(1, 2);
    const pStats = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [i, {}]));
    expect(seenCount(questions, pStats)).toBeLessThanOrEqual(questions.length);
  });

  it("is nought when there is nothing", () => {
    expect(seenCount([], {})).toBe(0);
    expect(seenCount(null, null)).toBe(0);
    expect(seenCount(qs(1), {})).toBe(0);
  });
});

describe("masteredCount", () => {
  it("only counts cards whose question still exists", () => {
    const questions = qs(1, 2);
    const srCards = { 1: { interval: 30 }, 2: { interval: 3 }, 77: { interval: 90 } };
    expect(masteredCount(questions, srCards, 21)).toBe(1);
  });

  it("treats a card with no interval as not learnt", () => {
    expect(masteredCount(qs(1), { 1: {} }, 21)).toBe(0);
    expect(masteredCount(qs(1), { 1: { interval: 21 } }, 21)).toBe(1);
  });
});

describe("share", () => {
  /* These three are what reaches a style attribute, so each one is a thing
     that has drawn wrongly on a screen at some point. */
  it("is nought rather than NaN when the total is nought", () => {
    expect(share(0, 0)).toBe(0);
    expect(Number.isNaN(share(5, 0))).toBe(false);
  });

  it("never exceeds one, however stale the count", () => {
    expect(share(100, 20)).toBe(1);
  });

  it("never goes below nought", () => {
    expect(share(-5, 20)).toBe(0);
  });

  it("is the plain fraction in between", () => {
    expect(share(5, 20)).toBe(0.25);
  });
});

/*
 * The bug this replaced.
 *
 * Progress used to read three manufactured fields off each question — block,
 * subject, topic — taken from the deck path as root / the one below it / the
 * last one. That is the shape the old question bank had, always exactly three
 * levels. Your decks are whatever depth you made them, so the three were only
 * ever right at exactly three: one level repeated the same name three times,
 * two duplicated it, four dropped a level in the middle. Generate puts people
 * straight into the first of those, because a new deck with no parent is one
 * level deep.
 *
 * These walk the decks instead, so the only thing that has to be true is that
 * a question lands in every deck above it.
 */
describe("buildTree, at every depth", () => {
  /* ids are the deck ids; a question's path is ancestors first, itself last */
  const chain = names => names.map((name, i) => ({
    id: `d${i}`, name, parentId: i ? `d${i - 1}` : null,
  }));
  const qIn = (id, path, n = 1) =>
    Array.from({ length: n }, (_, k) => ({ id: `${id}-${k}`, path: path.map(d => ({ id: d.id, name: d.name })) }));

  function totalsAt(names, answered) {
    const decks = chain(names);
    const qs = qIn("q", decks, 2);
    const pStats = answered ? { "q-0": { correct: 1, total: 2 } } : {};
    return buildTree(qs, decks, pStats);
  }

  it("one level deep still counts", () => {
    const [root] = totalsAt(["Renal"], true);
    expect(root.name).toBe("Renal");
    expect(root.total).toBe(2);
    expect(root.seen).toBe(1);
  });

  it("four levels deep keeps every level, including the middle", () => {
    const [root] = totalsAt(["Year 2", "Renal", "Week 1", "Upper Tract"], false);
    const names = [];
    (function walk(n) { names.push(n.name); n.children.forEach(walk); })(root);
    /* "Week 1" is the one the old three-field version silently dropped. */
    expect(names).toEqual(["Year 2", "Renal", "Week 1", "Upper Tract"]);
  });

  it("a parent's figure is the sum of what is under it", () => {
    const decks = [
      { id: "r", name: "Renal", parentId: null },
      { id: "a", name: "Week 1", parentId: "r" },
      { id: "b", name: "Week 2", parentId: "r" },
    ];
    const path = (...ids) => ids.map(id => ({ id, name: id }));
    const qs = [
      { id: 1, path: path("r", "a") },
      { id: 2, path: path("r", "a") },
      { id: 3, path: path("r", "b") },
    ];
    const [root] = buildTree(qs, decks, { 1: { correct: 1, total: 1 } });
    expect(root.total).toBe(3);
    expect(root.children.map(c => c.total)).toEqual([2, 1]);
    expect(root.seen).toBe(1);
  });

  it("a deck with nothing in it is still there", () => {
    const decks = [{ id: "r", name: "Empty", parentId: null }];
    const [root] = buildTree([], decks, {});
    expect(root.total).toBe(0);
    expect(root.seen).toBe(0);
  });
});

describe("leavesUnder", () => {
  it("is the node itself when nothing is under it", () => {
    expect(leavesUnder({ id: "a", children: [] })).toEqual(["a"]);
  });

  it("is every bottom deck, not the ones in between", () => {
    const tree = { id: "r", children: [
      { id: "a", children: [{ id: "a1", children: [] }, { id: "a2", children: [] }] },
      { id: "b", children: [] },
    ] };
    expect(leavesUnder(tree)).toEqual(["a1", "a2", "b"]);
  });
});

describe("pctOf", () => {
  it("is null rather than zero when nothing has been attempted", () => {
    expect(pctOf({ correct: 0, attempts: 0 })).toBeNull();
  });

  it("is the rounded share otherwise", () => {
    expect(pctOf({ correct: 3, attempts: 4 })).toBe(75);
  });
});
