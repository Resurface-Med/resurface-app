import { describe, it, expect } from "vitest";
import { shuffleOptions } from "../src/ui/theme.js";
import {
  PEER_MIN, peerPercents, fromCounts, displayPeerPcts, canonicalPick,
} from "../src/lib/peerSplit.js";
import { JUDGED, JUDGED_COUNT } from "../src/lib/peerJudgment.js";

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
    const opts = ["Femur", "Insulin", "Mitochondrion", "Aorta", "Glucagon"];
    const a = peerPercents(42, 5, 0, null, opts, "Which bone forms the thigh?");
    const b = peerPercents(42, 5, 0, null, opts, "Which bone forms the thigh?");
    expect(a).toEqual(b);
    expect(sum(a)).toBe(100);
    expect(new Set(a).size).toBe(5);
  });

  it("gives a close option a crowd, and never the same number as the key", () => {
    const opts = [
      "Transitional epithelial cells",
      "Columnar epithelial cells",
      "Squamous epithelial cells",
      "Mesothelial cells",
      "Endothelial cells",
    ];
    const pct = peerPercents(7, 5, 0, null, opts, "Which cells line the urinary bladder?");
    const easy = peerPercents(8, 5, 0, null, ["Femur", "Insulin", "Mitochondrion", "Aorta", "Glucagon"], "Which bone forms the thigh?");
    expect(sum(pct)).toBe(100);
    expect(new Set(pct).size).toBe(5);
    expect(pct[0]).toBeGreaterThan(pct[2]);
    expect(pct[0] - Math.max(pct[1], pct[2], pct[3], pct[4])).toBeGreaterThanOrEqual(8);
    expect(pct[2]).toBeGreaterThan(pct[4]);
    expect(easy[0]).toBeGreaterThan(pct[0]);
    expect(easy[0]).toBeGreaterThanOrEqual(68);
    expect(pct.every(n => n >= 5)).toBe(true);
  });

  it("reads the Year 2 deck off the choice, not off how the options are worded", () => {
    expect(JUDGED_COUNT).toBe(599);
    for (const [id, row] of JUDGED) {
      const pct = peerPercents(id, 5, row.correct, null);
      const wrong = pct.filter((_, i) => i !== row.correct);
      expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
      expect(new Set(pct).size).toBe(5);
      expect(Math.min(...pct)).toBeGreaterThanOrEqual(5);
      expect(pct[row.correct] - Math.max(...wrong)).toBeGreaterThanOrEqual(8);
      expect(pct[row.traps[0]]).toBe(Math.max(...wrong));
    }

    const schisto = peerPercents(1000202, 5, 3, null);
    expect(schisto[3]).toBeGreaterThan(schisto[4]);
    expect(schisto[4]).toBeGreaterThan(schisto[2]);

    const lining = peerPercents(1000221, 5, 3, null);
    expect(lining[3]).toBeGreaterThan(lining[2]);
    expect(lining[3]).toBeGreaterThanOrEqual(60);

    const turp = peerPercents(1000190, 5, 4, null);
    expect(turp[4]).toBeGreaterThan(turp[0]);
    expect(turp[4]).toBeGreaterThanOrEqual(60);

    const spelling = peerPercents(1002079, 5, 2, null);
    expect(spelling[2]).toBeGreaterThan(spelling[1]);
    expect(spelling[1]).toBeGreaterThan(20);

    const tallied = peerPercents(1000202, 5, 3, [10, 5, 3, 2, 0]);
    expect(tallied).toEqual([50, 25, 15, 10, 0]);
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

    const canonical = peerPercents(9, 4, 1, null, live.opts, live.q);
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
    expect(displayPeerPcts(shown, null, live)[0]).toBe(peerPercents(3, 3, 0, null, live, "Which is it?")[2]);
  });
});
