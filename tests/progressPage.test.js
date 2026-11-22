import { describe, expect, it } from "vitest";
import { weekDays, weekLine, weeklyAccuracy, headline, calendar, weakest, yearStanding, ordinal } from "../src/lib/progressPage";

/* Sunday 22 November 2026 */
const TODAY = "2026-11-22";
const d = (day, answered, correct) => ({ day, answered, correct });

describe("weekDays", () => {
  it("is Monday to Sunday of this week, today marked, later days future", () => {
    const w = weekDays([d("2026-11-17", 20, 15)], {}, "2026-11-21");
    expect(w.map(x => x.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(w[0].day).toBe("2026-11-16");
    expect(w[1]).toMatchObject({ answered: 20, correct: 15 });
    expect(w[5].today).toBe(true);
    expect(w[6].future).toBe(true);
  });
  it("falls back to the device's counts, with no split, when the server's days are missing", () => {
    const w = weekDays(null, { "2026-11-18": 12 }, "2026-11-21");
    expect(w[2]).toMatchObject({ answered: 12, correct: null });
  });
  it("starts the week on Monday when today is Sunday", () => {
    expect(weekDays([], {}, TODAY)[0].day).toBe("2026-11-16");
    expect(weekDays([], {}, TODAY)[6].today).toBe(true);
  });
});

describe("headline", () => {
  it("compares this week with the same seven days four weeks ago", () => {
    const days = [d("2026-11-20", 50, 39), d("2026-10-23", 40, 28)];
    expect(headline(days, TODAY)).toBe("78% right this week, up 8 points on a month ago.");
  });
  it("says nothing about a month ago without enough answers then", () => {
    expect(headline([d("2026-11-20", 50, 39)], TODAY)).toBe("78% right this week.");
  });
  it("is null with too little this week", () => {
    expect(headline([d("2026-11-20", 5, 5)], TODAY)).toBeNull();
  });
});

describe("weekLine", () => {
  it("says how this week compares and which day was biggest", () => {
    const days = [d("2026-11-17", 30, 20), d("2026-11-19", 55, 40), d("2026-11-10", 40, 30)];
    const week = weekDays(days, {}, "2026-11-21");
    expect(weekLine(week, days, {}, "2026-11-21")).toBe("45 more than last week. Thursday was your biggest day.");
  });
});

describe("weeklyAccuracy", () => {
  it("gives each week from oldest to this one, leaving thin weeks out", () => {
    const w = weeklyAccuracy([d("2026-11-17", 40, 30), d("2026-11-03", 10, 9)], TODAY, 3);
    expect(w.map(x => x.start)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(w[0].pct).toBeNull();
    expect(w[2].pct).toBe(75);
  });
});

describe("calendar", () => {
  it("lays out whole weeks, counts studied days and finds the busiest weekday", () => {
    const c = calendar({ "2026-11-19": 40, "2026-11-12": 5, "2026-11-20": 2 }, "2026-11-21", 2);
    expect(c.cells).toHaveLength(14);
    expect(c.cells[13]).toBeNull();
    expect(c.studied).toBe(3);
    expect(c.total).toBe(13);
    expect(c.mostActive).toBe("Thursdays");
    expect(c.cells.find(x => x?.day === "2026-11-19").level).toBe(3);
  });
});

describe("weakest", () => {
  const leaf = (id, name, attempts, correct) => ({ id, name, children: [], attempts, correct, seen: 1, total: 1 });
  it("lists the lowest-accuracy lectures with enough answers, naming their top deck", () => {
    const roots = [{ id: "r", name: "MSK", children: [leaf("a", "Gout", 20, 8), leaf("b", "Bone", 4, 0), leaf("c", "Hip", 30, 24)], attempts: 54, correct: 32 }];
    const w = weakest(roots, 5, 10);
    expect(w.map(x => x.node.name)).toEqual(["Gout", "Hip"]);
    expect(w[0]).toMatchObject({ root: "MSK", pct: 40 });
  });
});

describe("yearStanding", () => {
  const rows = [
    { user_id: "a", week_count: 300, rank: 1 },
    { user_id: "me", week_count: 120, rank: 2 },
    { user_id: "c", week_count: 60, rank: 3 },
    { user_id: "d", week_count: 0, rank: 4 },
  ];
  it("places you among the people who studied this week", () => {
    expect(yearStanding(rows, "me")).toMatchObject({ onBoard: true, rank: 2, people: 3, position: 0.5, mine: 120, avg: 160 });
  });
  it("says when you are not on the board yet", () => {
    expect(yearStanding(rows, "d")).toEqual({ onBoard: false, people: 3 });
  });
});

describe("ordinal", () => {
  it("writes ranks as people say them", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 38].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "38th"]);
  });
});

import { smoothPath } from "../src/lib/progressPage";
describe("smoothPath", () => {
  it("passes through every point and stays within them", () => {
    const d = smoothPath([[0, 100], [10, 50], [20, 50], [30, 0]]);
    expect(d.startsWith("M0.0,100.0")).toBe(true);
    expect(d.endsWith("30.0,0.0")).toBe(true);
    const ys = [...d.matchAll(/,(-?\d+\.\d)/g)].map(m => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });
  it("is a move for one point and nothing for none", () => {
    expect(smoothPath([[5, 5]])).toBe("M5,5");
    expect(smoothPath([])).toBe("");
  });
});
