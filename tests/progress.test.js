import { describe, it, expect } from "vitest";
import { seenCount, masteredCount, share } from "../src/lib/progress.js";

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
