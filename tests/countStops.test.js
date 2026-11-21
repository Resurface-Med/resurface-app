import { describe, it, expect } from "vitest";
import { countStops, nearestStop } from "../src/lib/countStops";

describe("countStops", () => {
  it("lands exactly on 20 in a pool of thousands", () => {
    const s = countStops(3400);
    expect(s).toContain(20);
    expect(s).toContain(50);
    expect(s[s.length - 1]).toBe(3400);
    expect(s.length).toBeLessThan(80);
  });
  it("is every number in a small pool", () => {
    expect(countStops(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("rises strictly and never passes the pool", () => {
    for (const m of [1, 19, 21, 99, 501, 1234]) {
      const s = countStops(m);
      s.forEach((v, i) => { if (i) expect(v).toBeGreaterThan(s[i - 1]); });
      expect(s[s.length - 1]).toBe(m);
    }
  });
  it("finds the nearest stop for a typed count", () => {
    const s = countStops(1000);
    expect(s[nearestStop(s, 37)]).toBe(35);
    expect(s[nearestStop(s, 20)]).toBe(20);
  });
});
