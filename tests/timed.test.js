import { describe, expect, it } from "vitest";
import { formatClock, timeLimit, timedLine } from "../src/lib/timed.js";

describe("timed sessions", () => {
  it("gives a minute a question", () => {
    expect(timeLimit(10)).toBe(600_000);
    expect(timeLimit(0)).toBe(60_000);
  });
  it("formats the clock", () => {
    expect(formatClock(600_000)).toBe("10:00");
    expect(formatClock(245_000)).toBe("4:05");
    expect(formatClock(1_400)).toBe("0:02");
    expect(formatClock(-5)).toBe("0:00");
    expect(formatClock(3_750_000)).toBe("1:02:30");
  });
  it("says how the time went", () => {
    expect(timedLine({ limitMs: 600_000, usedMs: 412_000, ranOut: false })).toBe("Finished in 6:52 of 10:00.");
    expect(timedLine({ limitMs: 600_000, usedMs: 600_000, ranOut: true })).toBe("Time ran out at 10:00.");
  });
});
