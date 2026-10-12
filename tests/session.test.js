import { describe, it, expect } from "vitest";
import { reask, REASK_GAP } from "../src/lib/session.js";

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
