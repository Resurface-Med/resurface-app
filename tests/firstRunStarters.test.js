import { describe, it, expect } from "vitest";
import { STARTERS, starterIds } from "../src/lib/firstRun.js";

const BASE = 1_000_000;

describe("starter questions", () => {
  it("gives each year three", () => {
    expect(STARTERS[1]).toHaveLength(3);
    expect(STARTERS[2]).toHaveLength(3);
  });
  it("returns only those that exist, as app ids", () => {
    const qs = [{ id: BASE + 10562 }, { id: BASE + 11239 }, { id: BASE + 1 }];
    expect(starterIds(1, qs, BASE)).toEqual([BASE + 10562, BASE + 11239]);
  });
  it("is empty for a year without starters or no year", () => {
    expect(starterIds(3, [{ id: BASE + 10562 }], BASE)).toEqual([]);
    expect(starterIds(null, [{ id: BASE + 10562 }], BASE)).toEqual([]);
  });
});
