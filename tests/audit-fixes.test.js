import { describe, it, expect, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("../src/data", () => ({ GEN_ID_BASE: 1_000_000 }));

import { liveStreak, yesterdayKey, todayKey } from "../src/lib/storage.js";
import { selectAll, PAGE } from "../src/lib/remote.js";

describe("streak as it stands today", () => {
  const at = new Date(2026, 9, 15, 12);
  it("keeps a streak studied today or yesterday", () => {
    expect(liveStreak({ streak: 5, longest: 9, lastDate: "2026-10-15" }, at).streak).toBe(5);
    expect(liveStreak({ streak: 5, longest: 9, lastDate: "2026-10-14" }, at).streak).toBe(5);
  });
  it("shows a lapsed streak as 0, and keeps the best", () => {
    const s = liveStreak({ streak: 12, longest: 12, lastDate: "2026-10-08" }, at);
    expect(s.streak).toBe(0);
    expect(s.longest).toBe(12);
  });
  it("finds yesterday by the calendar, across the spring clock change", () => {
    // 29 March 2026, 00:30 — the day before was 23 hours long in the UK.
    expect(yesterdayKey(new Date(2026, 2, 29, 0, 30))).toBe("2026-03-28");
    expect(yesterdayKey(new Date(2026, 0, 1))).toBe("2025-12-31");
    expect(todayKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("selectAll", () => {
  function fakeTable(n) {
    const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
    const calls = [];
    const query = () => ({
      order: () => ({ range: (from, to) => { calls.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); } }),
    });
    return { query, calls };
  }
  it("reads past the first thousand", async () => {
    const t = fakeTable(2500);
    const { data } = await selectAll(t.query, "id");
    expect(data).toHaveLength(2500);
    expect(t.calls).toEqual([[0, PAGE - 1], [PAGE, 2 * PAGE - 1], [2 * PAGE, 3 * PAGE - 1]]);
  });
  it("stops after an exact multiple with one empty page", async () => {
    const t = fakeTable(PAGE);
    expect((await selectAll(t.query, "id")).data).toHaveLength(PAGE);
    expect(t.calls).toHaveLength(2);
  });
  it("passes an error through rather than returning a partial list", async () => {
    const query = () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: new Error("x") }) }) });
    const r = await selectAll(query, "id");
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
