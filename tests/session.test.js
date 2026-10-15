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

import { shiftFrom, reaskAt, refreshSaved } from "../src/lib/session.js";

describe("answers follow a re-asked question", () => {
  it("moves answers at or past the insertion point", () => {
    expect(shiftFrom({ 0: 1, 3: 2, 6: 4, 9: 0 }, 6)).toEqual({ 0: 1, 3: 2, 7: 4, 10: 0 });
  });
  it("the jump-ahead case: answered 9, back to 2, missed it", () => {
    const queue = queueOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
    const sels = { 2: 0, 9: 3 };              // 9 answered after jumping ahead
    const at = reaskAt(queue, 2);
    const next = reask(queue, 2, q(3));
    const moved = shiftFrom(sels, at);
    expect(next[at].id).toBe(3);
    expect(next[10].id).toBe(10);             // question 10 moved to slot 10…
    expect(moved[10]).toBe(3);                // …and its answer went with it
    expect(moved[9]).toBeUndefined();
  });
});

describe("refreshSaved", () => {
  const Q = (id, extra = {}) => ({ id, q: `Q${id}`, opts: ["a", "b", "c"], ans: 0, exp: "e", ...extra });
  const live = (...qs) => new Map(qs.map(x => [x.id, x]));
  const reshuffle = x => ({ ...x, reshuffled: true });

  it("keeps answered questions as answered, even if deleted since", () => {
    const r = refreshSaved({ queue: [Q(1), Q(2)], sels: { 0: 1 }, idx: 1 }, live(Q(2)), reshuffle);
    expect(r.queue.map(x => x.id)).toEqual([1, 2]);
    expect(r.sels).toEqual({ 0: 1 });
  });
  it("drops unanswered questions that no longer exist, and re-keys answers", () => {
    const r = refreshSaved({ queue: [Q(1), Q(2), Q(3)], sels: { 2: 0 }, idx: 2 }, live(Q(1), Q(3)), reshuffle);
    expect(r.queue.map(x => x.id)).toEqual([1, 3]);
    expect(r.sels).toEqual({ 1: 0 });
    expect(r.idx).toBe(1);
  });
  it("refreshes an unanswered question that was corrected, leaves an unchanged one", () => {
    const r = refreshSaved({ queue: [Q(1, { opts: ["c", "a", "b"], ans: 1 }), Q(2)], sels: {}, idx: 0 },
      live(Q(1), Q(2, { q: "Fixed stem" })), reshuffle);
    expect(r.queue[0].reshuffled).toBeUndefined();   // same question, saved shuffle kept
    expect(r.queue[1]).toMatchObject({ q: "Fixed stem", reshuffled: true });
  });
  it("returns null when nothing is left", () => {
    expect(refreshSaved({ queue: [Q(1)], sels: {}, idx: 0 }, live(), reshuffle)).toBeNull();
  });
});
