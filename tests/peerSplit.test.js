import { describe, it, expect } from "vitest";
import { shuffleOptions } from "../src/ui/theme.js";
import {
  PEER_MIN, peerPercents, fromCounts, displayPeerPcts, canonicalPick,
} from "../src/lib/peerSplit.js";

const sum = xs => xs.reduce((a, b) => a + b, 0);

describe("peerPercents", () => {
  it("uses the real tally once enough people have answered", () => {
    const counts = [10, 5, 3, 2, 0];
    expect(sum(counts)).toBe(PEER_MIN);
    expect(peerPercents(1, 5, 0, counts)).toEqual([50, 25, 15, 10, 0]);
  });

  it("ignores a tally that is still too thin", () => {
    const thin = [8, 1, 0, 0, 0];
    expect(peerPercents("q", 5, 2, thin)).toEqual(peerPercents("q", 5, 2, null));
  });

  it("is the same number for everyone, and the percents add up", () => {
    const a = peerPercents(42, 5, 2, null);
    const b = peerPercents(42, 5, 2, null);
    expect(a).toEqual(b);
    expect(sum(a)).toBe(100);
    expect(a).toHaveLength(5);
    expect(a.every(n => n >= 4)).toBe(true);
  });

  it("stays in a plausible range across questions", () => {
    let correctLeads = 0;
    for (let id = 1; id <= 280; id++) {
      const correct = id % 5;
      const pct = peerPercents(id, 5, correct, null);
      expect(sum(pct)).toBe(100);
      expect(pct[correct]).toBeGreaterThanOrEqual(32);
      expect(pct[correct]).toBeLessThanOrEqual(75);
      expect(Math.max(...pct.filter((_, i) => i !== correct))).toBeLessThan(70);
      if (pct[correct] === Math.max(...pct)) correctLeads += 1;
    }
    expect(correctLeads).toBeGreaterThan(200);
    expect(correctLeads).toBeLessThan(280);
  });

  it("rounds a real split so the parts still add to 100", () => {
    expect(sum(fromCounts([7, 7, 6], 3))).toBe(100);
    expect(fromCounts([7, 7, 6], 3)).toEqual([35, 35, 30]);
  });
});

describe("shuffle and the split", () => {
  it("keeps each percent on its option when the letters move", () => {
    const live = { id: 9, opts: ["a", "b", "c", "d"], ans: 1, optExp: ["", "", "", ""] };
    const shown = shuffleOptions(live);
    expect(shown.optOrder.map(i => live.opts[i])).toEqual(shown.opts);
    expect(shown.optOrder[shown.ans]).toBe(1);

    const canonical = peerPercents(9, 4, 1, null);
    const onScreen = displayPeerPcts(shown, null, live.opts);
    shown.opts.forEach((text, i) => {
      expect(onScreen[i]).toBe(canonical[live.opts.indexOf(text)]);
    });
    expect(canonicalPick(shown, shown.ans, live.opts)).toBe(1);
  });

  it("can map an older shuffled question by its wording", () => {
    const live = ["a", "b", "c"];
    const shown = { id: 3, opts: ["c", "a", "b"], ans: 1 };
    expect(canonicalPick(shown, 0, live)).toBe(2);
    expect(displayPeerPcts(shown, null, live)[0]).toBe(peerPercents(3, 3, 0, null)[2]);
  });
});
