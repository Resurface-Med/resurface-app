import { describe, it, expect } from "vitest";
import { splitFor, PEER_MIN } from "../src/lib/peerSplit.js";

const opts = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

describe("splitFor", () => {
  it("shows nothing below the threshold", () => {
    expect(PEER_MIN).toBe(10);
    expect(splitFor(opts, [{ option_text: "Alpha", n: 9 }])).toBeNull();
    expect(splitFor(opts, [])).toBeNull();
  });

  it("follows the on-screen order, not the stored one", () => {
    const shuffled = ["Charlie", "Alpha", "Echo", "Bravo", "Delta"];
    const s = splitFor(shuffled, [{ option_text: "Alpha", n: 6 }, { option_text: "Bravo", n: 4 }]);
    expect(s).toEqual({ pcts: [0, 60, 0, 40, 0], total: 10 });
  });

  it("sums to 100", () => {
    const s = splitFor(opts, [{ option_text: "Alpha", n: 1 }, { option_text: "Bravo", n: 1 }, { option_text: "Charlie", n: 1 }, { option_text: "Delta", n: 4 }, { option_text: "Echo", n: 4 }]);
    expect(s.pcts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(s.total).toBe(11);
  });

  it("ignores picks for text that is no longer an option", () => {
    expect(splitFor(opts, [{ option_text: "Alpha", n: 9 }, { option_text: "Old wording", n: 5 }])).toBeNull();
  });
});
