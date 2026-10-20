import { describe, it, expect } from "vitest";
import { sessionLabel, toRecord, fromRecord, mergeSessions, ago } from "../src/lib/pastSessions.js";

const q = (id, leaf, root = "Year 2", opts = ["a", "b", "c"], ans = 0) => ({
  id, q: `Q${id}`, opts, ans, path: [{ id: "r", name: root }, { id: leaf, name: leaf }],
});

describe("sessionLabel", () => {
  it("names one deck with its top deck", () => {
    expect(sessionLabel([q(1, "Renal"), q(2, "Renal")])).toBe("Year 2 › Renal");
  });
  it("counts decks under one top deck, or across several", () => {
    expect(sessionLabel([q(1, "Renal"), q(2, "Cardio")])).toBe("Year 2 · 2 decks");
    expect(sessionLabel([q(1, "Renal"), q(2, "Cardio", "Year 1")])).toBe("2 decks");
  });
  it("falls back for nothing", () => {
    expect(sessionLabel([])).toBe("Practice");
  });
});

describe("toRecord / fromRecord", () => {
  const queue = [q(1, "Renal", "Year 2", ["x", "y", "z"], 1), q(2, "Renal"), q(3, "Renal")];

  it("records picks as text, with counts", () => {
    const r = toRecord({ sid: "s", queue, sels: { 0: 1, 1: 2 }, idx: 2, startedAt: "t0", now: "t1" });
    expect(r.items).toEqual([{ id: 1, pick: "y" }, { id: 2, pick: "c" }, { id: 3, pick: null }]);
    expect(r).toMatchObject({ id: "s", total: 3, answered: 2, correct: 1, finished: false, idx: 2, created_at: "t0", updated_at: "t1" });
  });

  it("is finished when every question is answered, or when told", () => {
    expect(toRecord({ sid: "s", queue, sels: { 0: 1, 1: 0, 2: 0 } }).finished).toBe(true);
    expect(toRecord({ sid: "s", queue, sels: {}, finished: true }).finished).toBe(true);
  });

  it("rebuilds on today's questions, finding picks by text after a reshuffle", () => {
    const rec = toRecord({ sid: "s", queue, sels: { 0: 1, 1: 2 }, idx: 2 });
    const live = new Map(queue.map(x => [x.id, x]));
    const reverse = x => ({ ...x, opts: [...x.opts].reverse(), ans: x.opts.length - 1 - x.ans });
    const got = fromRecord(rec, live, reverse);
    expect(got.queue.map(x => x.id)).toEqual([1, 2, 3]);
    expect(got.queue[0].opts[got.sels[0]]).toBe("y");
    expect(got.queue[1].opts[got.sels[1]]).toBe("c");
    expect(got.sels[2]).toBeUndefined();
    expect(got.idx).toBe(2);
    /* Saved at the question just answered: carries on from the next open one. */
    expect(fromRecord({ ...rec, idx: 0 }, live).idx).toBe(2);
    expect(fromRecord(toRecord({ sid: "s", queue, sels: { 0: 1, 1: 0, 2: 0 }, idx: 2 }), live).idx).toBe(0);
  });

  it("drops deleted questions and forgets picks that no longer exist", () => {
    const rec = toRecord({ sid: "s", queue, sels: { 0: 1, 1: 2 }, idx: 0 });
    const live = new Map([[2, { ...queue[1], opts: ["a", "b", "edited"] }], [3, queue[2]]]);
    const got = fromRecord(rec, live);
    expect(got.queue.map(x => x.id)).toEqual([2, 3]);
    expect(got.sels).toEqual({});
    expect(fromRecord(rec, new Map())).toBeNull();
  });
});

describe("mergeSessions", () => {
  it("replaces by id and keeps the newest first", () => {
    const list = [{ id: "a", updated_at: "2" }, { id: "b", updated_at: "1" }];
    expect(mergeSessions(list, { id: "b", updated_at: "3" }).map(s => s.id)).toEqual(["b", "a"]);
    expect(mergeSessions(list, { id: "c", updated_at: "0" }, 2).map(s => s.id)).toEqual(["a", "b"]);
  });
});

describe("ago", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  it("says it plainly", () => {
    expect(ago("2026-10-20T11:59:30Z", now)).toBe("Just now");
    expect(ago("2026-10-20T11:00:00Z", now)).toBe("1 hour ago");
    expect(ago("2026-10-19T10:00:00Z", now)).toBe("Yesterday");
    expect(ago("2026-10-16T12:00:00Z", now)).toBe("4 days ago");
    expect(ago("2026-10-01T12:00:00Z", now)).toBe("1 Oct");
  });
});
