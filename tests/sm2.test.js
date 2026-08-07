import { describe, it, expect } from "vitest";
import { sm2Review, formatInterval, isDue } from "../src/lib/sm2.js";

// These guard the scheduling contract. If any of this drifts, every user's
// review queue silently reorders itself and nobody notices for weeks.

const GOOD = 3, AGAIN = 1, HARD = 2, EASY = 4;
const DAY = 24 * 60 * 60 * 1000;

describe("sm2Review — graduating a new card", () => {
  it("gives a new card a 1 day interval on Good", () => {
    const r = sm2Review({}, GOOD);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBeGreaterThanOrEqual(1);
    // ±5% fuzz on a 1-day interval, floored at 1
    expect(r.interval).toBeLessThanOrEqual(2);
  });

  it("jumps a new card straight to ~4 days on Easy", () => {
    const r = sm2Review({}, EASY);
    expect(r.interval).toBeGreaterThanOrEqual(3);
    expect(r.interval).toBeLessThanOrEqual(5);
    expect(r.easeFactor).toBeCloseTo(2.65, 5);
  });

  it("holds a new card in learning steps on Hard, without counting a lapse", () => {
    const r = sm2Review({}, HARD);
    expect(r.repetitions).toBe(0);
    expect(r.intervalMinutes).toBe(10);
    expect(r.lapses).toBe(0);
  });

  it("uses the second review to set ~6 days on Good", () => {
    const r = sm2Review({ interval: 1, repetitions: 1, easeFactor: 2.5 }, GOOD);
    expect(r.repetitions).toBe(2);
    expect(r.interval).toBeGreaterThanOrEqual(5);
    expect(r.interval).toBeLessThanOrEqual(7);
  });
});

describe("sm2Review — lapses", () => {
  it("sends a mature card back to a 1 minute step and counts the lapse", () => {
    const r = sm2Review({ interval: 30, repetitions: 5, easeFactor: 2.5, lapses: 0 }, AGAIN);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(0);
    expect(r.intervalMinutes).toBe(1);
    expect(r.lapses).toBe(1);
  });

  it("does not count a lapse for a card that never graduated", () => {
    const r = sm2Review({ repetitions: 0 }, AGAIN);
    expect(r.lapses).toBe(0);
  });

  it("penalises ease on Again but never below the 1.3 floor", () => {
    let card = { interval: 10, repetitions: 3, easeFactor: 1.35 };
    for (let i = 0; i < 5; i++) card = sm2Review(card, AGAIN);
    expect(card.easeFactor).toBe(1.3);
  });
});

describe("sm2Review — ease factor bounds", () => {
  it("caps ease at 3.0 no matter how many times Easy is pressed", () => {
    let card = { interval: 10, repetitions: 3, easeFactor: 2.9 };
    for (let i = 0; i < 10; i++) card = sm2Review(card, EASY);
    expect(card.easeFactor).toBe(3.0);
  });
});

describe("sm2Review — interval bounds", () => {
  it("never schedules further out than a year", () => {
    let card = { interval: 300, repetitions: 10, easeFactor: 3.0 };
    for (let i = 0; i < 5; i++) card = sm2Review(card, EASY);
    expect(card.interval).toBeLessThanOrEqual(365);
  });

  it("always moves a graduated card at least one day out", () => {
    const r = sm2Review({ interval: 1, repetitions: 2, easeFactor: 1.3 }, HARD);
    expect(r.interval).toBeGreaterThanOrEqual(1);
  });

  it("sets dueDate consistent with the interval it returned", () => {
    const before = Date.now();
    const r = sm2Review({ interval: 6, repetitions: 2, easeFactor: 2.5 }, GOOD);
    const expected = before + r.interval * DAY;
    expect(Math.abs(r.dueDate - expected)).toBeLessThan(2000);
  });
});

describe("sm2Review — input tolerance", () => {
  it("treats a missing card as new rather than throwing", () => {
    expect(() => sm2Review(undefined, GOOD)).not.toThrow();
    expect(sm2Review(null, GOOD).repetitions).toBe(1);
  });
});

describe("isDue", () => {
  it("treats an unseen card as due", () => {
    expect(isDue(undefined)).toBe(true);
    expect(isDue({})).toBe(true);
  });

  it("distinguishes past from future due dates", () => {
    expect(isDue({ dueDate: Date.now() - 1000 })).toBe(true);
    expect(isDue({ dueDate: Date.now() + 60_000 })).toBe(false);
  });
});

describe("formatInterval", () => {
  it("renders minutes, days, weeks and months", () => {
    expect(formatInterval(null, 10)).toBe("<10m");
    expect(formatInterval(0)).toBe("<1d");
    expect(formatInterval(1)).toBe("1d");
    expect(formatInterval(3)).toBe("3d");
    expect(formatInterval(14)).toBe("2w");
    expect(formatInterval(60)).toBe("2mo");
  });
});
