import { describe, expect, it } from "vitest";
import { addToBatch, allLazy, batchBody, batchable } from "../src/lib/writeBatch";

const me = "user-1";
const practice = (q, correct, total) => ({ kind: "practice", userId: me, questionId: q, correct, total });

describe("batchable", () => {
  it("takes the answer's kinds for the signed-in account only", () => {
    expect(batchable(practice(1, 1, 1), me)).toBe(true);
    expect(batchable({ ...practice(1, 1, 1), userId: "someone-else" }, me)).toBe(false);
    expect(batchable(practice(1, 1, 1), null)).toBe(false);
    expect(batchable({ kind: "bookmark-add", userId: me, questionId: 1 }, me)).toBe(false);
  });
  it("leaves out a session too long for the table, so it cannot sink the answer with it", () => {
    const items = n => Array.from({ length: n }, (_, i) => ({ id: i, pick: null }));
    expect(batchable({ kind: "session-save", userId: me, rec: { id: "s", items: items(1000) } }, me)).toBe(true);
    expect(batchable({ kind: "session-save", userId: me, rec: { id: "s", items: items(1001) } }, me)).toBe(false);
  });
});

describe("addToBatch", () => {
  it("keeps only the newest absolute value of each thing", () => {
    let held = [];
    held = addToBatch(held, practice(7, 0, 1));
    held = addToBatch(held, practice(8, 1, 1));
    held = addToBatch(held, practice(7, 1, 2));
    expect(held).toEqual([practice(8, 1, 1), practice(7, 1, 2)]);
  });
  it("keeps every answer and pick, which are rows of their own", () => {
    const a = { kind: "answer", userId: me, questionId: 7, correct: true, ms: 900, answeredAt: "2026-11-22T10:00:00.000Z" };
    let held = addToBatch([], a);
    held = addToBatch(held, { ...a, answeredAt: "2026-11-22T10:00:05.000Z" });
    expect(held).toHaveLength(2);
  });
  it("collapses the day's count, the streak and study time", () => {
    let held = [];
    held = addToBatch(held, { kind: "activity", userId: me, day: "2026-11-22", count: 4 });
    held = addToBatch(held, { kind: "activity", userId: me, day: "2026-11-22", count: 5 });
    held = addToBatch(held, { kind: "study-time", userId: me, seconds: 600 });
    held = addToBatch(held, { kind: "study-time", userId: me, seconds: 615 });
    expect(held.map(o => o.count ?? o.seconds)).toEqual([5, 615]);
  });
});

describe("batchBody", () => {
  it("writes the same columns each kind's own request did", () => {
    const body = batchBody([
      { kind: "sr", userId: me, questionId: 5, card: { interval: 3, repetitions: 1, easeFactor: 2.6, lapses: 0, dueDate: Date.UTC(2026, 10, 25), intervalMinutes: null } },
      { kind: "answer", userId: me, questionId: 5, correct: false, ms: 1200, at: Date.UTC(2026, 10, 22) },
      { kind: "streak", userId: me, current: 3, longest: 9, lastDate: "2026-11-22" },
    ]);
    expect(body[0]).toEqual({ k: "sr", r: { question_id: 5, interval: 3, repetitions: 1, ease_factor: 2.6, lapses: 0, due_date: "2026-11-25T00:00:00.000Z", interval_minutes: null } });
    expect(body[1].r.at).toBe("2026-11-22T00:00:00.000Z");
    expect(body[2]).toEqual({ k: "streak", r: { current: 3, longest: 9, last_date: "2026-11-22" } });
    expect(JSON.stringify(body)).not.toContain(me);
  });
});

describe("allLazy", () => {
  it("is study time on its own", () => {
    expect(allLazy([{ kind: "study-time", userId: me, seconds: 30 }])).toBe(true);
    expect(allLazy([{ kind: "study-time", userId: me, seconds: 30 }, practice(1, 1, 1)])).toBe(false);
    expect(allLazy([])).toBe(false);
  });
});
