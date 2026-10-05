import { describe, it, expect } from "vitest";
import { append, dropOnce, QUEUE_MAX } from "../src/lib/queue.js";

const op = (kind, n) => ({ kind, userId: "u", questionId: n });

describe("append", () => {
  it("adds to the end", () => {
    expect(append([op("practice", 1)], op("practice", 2)).map(o => o.questionId))
      .toEqual([1, 2]);
  });

  it("starts from nothing", () => {
    expect(append(null, op("practice", 1))).toHaveLength(1);
  });

  it("keeps the newest when an offline session runs long", () => {
    let q = [];
    for (let i = 0; i < QUEUE_MAX + 50; i += 1) q = append(q, op("practice", i));
    expect(q).toHaveLength(QUEUE_MAX);
    expect(q[q.length - 1].questionId).toBe(QUEUE_MAX + 49);
    expect(q[0].questionId).toBe(50);
  });
});

describe("dropOnce", () => {
  /* The queue goes through localStorage between being written and being
     flushed, so the object handed back is never the object put in. Matching
     by reference would silently never remove anything, and the same writes
     would be replayed on every reconnect for ever. */
  it("matches by value, not by identity", () => {
    const queue = JSON.parse(JSON.stringify([op("practice", 1), op("practice", 2)]));
    const out = dropOnce(queue, op("practice", 1));
    expect(out.map(o => o.questionId)).toEqual([2]);
  });

  /* Answering the same question twice while offline is two identical ops and
     both have to land, so removing one must not remove its twin. */
  it("removes one instance, not every match", () => {
    const queue = [op("practice", 1), op("practice", 1), op("practice", 2)];
    const out = dropOnce(queue, op("practice", 1));
    expect(out).toHaveLength(2);
    expect(out.filter(o => o.questionId === 1)).toHaveLength(1);
  });

  it("leaves the queue alone when there is no match", () => {
    const queue = [op("practice", 1)];
    expect(dropOnce(queue, op("practice", 9))).toEqual(queue);
  });

  it("does not mutate what it was given", () => {
    const queue = [op("practice", 1), op("practice", 2)];
    dropOnce(queue, op("practice", 1));
    expect(queue).toHaveLength(2);
  });

  it("copes with an empty or missing queue", () => {
    expect(dropOnce([], op("practice", 1))).toEqual([]);
    expect(dropOnce(null, op("practice", 1))).toEqual([]);
  });
});

/*
 * The failure this is all for.
 *
 * The old flush emptied storage up front and wrote the survivors back at the
 * end, so for the length of the flush every unsent write existed only in a
 * local variable. This models the two ways that lost data, against the
 * drop-after-success order that replaced it.
 */
describe("a flush that is interrupted", () => {
  function flushUntilCrash(stored, apply, crashAfter) {
    const start = [...stored];
    let box = [...stored];
    let done = 0;
    for (const o of start) {
      if (done === crashAfter) return box;         // tab closed, network died
      if (apply(o)) { done += 1; box = dropOnce(box, o); }
    }
    return box;
  }

  it("keeps everything that had not been sent yet", () => {
    const stored = [op("practice", 1), op("practice", 2), op("practice", 3), op("practice", 4)];
    const left = flushUntilCrash(stored, () => true, 2);
    expect(left.map(o => o.questionId)).toEqual([3, 4]);
  });

  it("keeps a write that was made during the flush", () => {
    let box = [op("practice", 1), op("practice", 2)];
    box = dropOnce(box, op("practice", 1));        // first one lands
    box = append(box, op("practice", 99));          // the app queues another
    box = dropOnce(box, op("practice", 2));        // second one lands
    expect(box.map(o => o.questionId)).toEqual([99]);
  });
});
