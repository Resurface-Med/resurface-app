import { describe, it, expect } from "vitest";
import { compactQueue, expandSaved } from "./session";

const live = new Map([
  [1, { id: 1, q: "a", opts: ["w", "x", "y"], ans: 0, optExp: [null, "x!", "y!"] }],
  [2, { id: 2, q: "b", opts: ["p", "q"], ans: 1 }],
]);

describe("compact saved sessions", () => {
  it("keeps only ids and option order", () => {
    const q = [{ ...live.get(1), opts: ["y", "w", "x"], optOrder: [2, 0, 1], ans: 1 }];
    expect(compactQueue(q)).toEqual([{ id: 1, o: [2, 0, 1] }]);
  });
  it("rebuilds the questions shuffled as they were", () => {
    const s = expandSaved({ queue: [{ id: 1, o: [2, 0, 1] }, { id: 2 }], sels: { 0: 1 }, idx: 1 }, live);
    expect(s.queue[0].opts).toEqual(["y", "w", "x"]);
    expect(s.queue[0].ans).toBe(1);
    expect(s.queue[0].optExp).toEqual(["y!", null, "x!"]);
    expect(s.queue[1].opts).toEqual(["p", "q"]);
    expect(s.sels).toEqual({ 0: 1 });
    expect(s.idx).toBe(1);
  });
  it("drops questions gone from the bank and moves answers with the rest", () => {
    const s = expandSaved({ queue: [{ id: 9 }, { id: 2 }], sels: { 1: 0 }, idx: 1 }, live);
    expect(s.queue.map(q => q.id)).toEqual([2]);
    expect(s.sels).toEqual({ 0: 0 });
    expect(s.idx).toBe(0);
  });
  it("leaves an old full copy alone", () => {
    const old = { queue: [{ id: 1, q: "a", opts: ["w"] }], sels: {} };
    expect(expandSaved(old, live)).toBe(old);
  });
});
