import { describe, it, expect } from "vitest";
import { reask, clearedCount, distinctCount, REASK_GAP } from "../src/lib/session.js";

const q = n => ({ id: n, q: `Q${n}` });
const queueOf = (...ids) => ids.map(q);
const ids = qs => qs.map(x => x.id);

describe("reask", () => {
  it("puts the question back the given number of places further on", () => {
    const queue = queueOf(1, 2, 3, 4, 5, 6, 7, 8);
    expect(ids(reask(queue, 1, q(2), 4))).toEqual([1, 2, 3, 4, 5, 2, 6, 7, 8]);
  });

  it("defaults to a gap of four", () => {
    const queue = queueOf(1, 2, 3, 4, 5, 6, 7, 8);
    expect(REASK_GAP).toBe(4);
    expect(ids(reask(queue, 0, q(1)))).toEqual(ids(reask(queue, 0, q(1), 4)));
  });

  it("puts it last when the gap runs past the end", () => {
    const queue = queueOf(1, 2, 3);
    expect(ids(reask(queue, 2, q(3), 4))).toEqual([1, 2, 3, 3]);
  });

  /*
   * The one that matters. Answers are keyed by queue position, so anything
   * inserted at or behind the current index renumbers slots that already hold
   * somebody's answers — every question after the insertion would be credited
   * with the answer belonging to the one before it.
   */
  it("never inserts at or behind the current position", () => {
    const queue = queueOf(1, 2, 3, 4, 5);
    for (const gap of [-5, -1, 0]) {
      const out = reask(queue, 2, q(3), gap);
      expect(ids(out).slice(0, 3)).toEqual([1, 2, 3]);
      expect(out.length).toBe(6);
    }
  });

  it("leaves the original queue alone", () => {
    const queue = queueOf(1, 2, 3);
    reask(queue, 0, q(1));
    expect(ids(queue)).toEqual([1, 2, 3]);
  });

  it("can put the same question back more than once", () => {
    let queue = queueOf(1, 2, 3, 4);
    queue = reask(queue, 0, q(1), 2);          // wrong first time
    queue = reask(queue, 2, q(1), 2);          // wrong again when it came round
    expect(ids(queue).filter(id => id === 1).length).toBe(3);
  });
});

describe("clearedCount", () => {
  it("counts a question once however many times it was asked", () => {
    const results = {
      0: { id: 7, correct: false },
      1: { id: 8, correct: true },
      2: { id: 7, correct: true },
      3: { id: 7, correct: true },
    };
    expect(clearedCount(results)).toBe(2);
  });

  it("is nought when nothing has been got right", () => {
    expect(clearedCount({ 0: { id: 1, correct: false } })).toBe(0);
    expect(clearedCount({})).toBe(0);
    expect(clearedCount(null)).toBe(0);
  });
});

describe("distinctCount", () => {
  it("counts questions, not cards", () => {
    expect(distinctCount(queueOf(1, 2, 3, 2, 1))).toBe(3);
    expect(distinctCount([])).toBe(0);
    expect(distinctCount(null)).toBe(0);
  });

  /* The two together are what the counter shows, and it must never read
     more cleared than there are questions, however often one came back. */
  it("cannot report more cleared than there are questions", () => {
    const queue = queueOf(1, 2, 2, 2);
    const results = { 0: { id: 1, correct: true }, 1: { id: 2, correct: true }, 2: { id: 2, correct: true } };
    expect(clearedCount(results)).toBeLessThanOrEqual(distinctCount(queue));
  });
});
