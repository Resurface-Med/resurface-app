import { describe, it, expect } from "vitest";
import { structureColour, ORGAN_TINTS, rgb2hsl, hsl2rgb } from "../src/lib/anatomyColour.js";

const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = h => rgb2hsl(hex2rgb(h))[2];

describe("structure colours", () => {
  it("gives every conventional tint a real hex", () => {
    for (const [, tint] of ORGAN_TINTS) expect(tint).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("keeps convention where convention exists", () => {
    const green = structureColour({ base: "#b8916b", concept: "gallbladder", index: 3 });
    expect(green).toBe(structureColour({ base: "#b8916b", concept: "cystic duct", index: 40 }));
    // Bile is green: more green than red, whatever the system's brown says.
    const [r, g] = hex2rgb(green);
    expect(g).toBeGreaterThan(r);
  });

  it("holds one organ to one colour across its segments", () => {
    const parts = ["proximal part of ileum", "middle part of ileum", "distal part of ileum",
                   "duodenum", "proximal part of jejunum"];
    const seen = new Set(parts.map((c, i) => structureColour({ base: "#b8916b", concept: c, index: i })));
    expect(seen.size).toBe(1);
  });

  it("reads a name for what it is, not what it contains", () => {
    /* Caught against the real abdomen bundle: the mesentery of the small
       intestine is fat, not bowel, and matching it as bowel cost the gut its
       edge against the thing it lies in. */
    const mesentery = structureColour({ base: "#b8916b", concept: "mesentery of small intestine", index: 2 });
    const bowel = structureColour({ base: "#b8916b", concept: "duodenum", index: 9 });
    expect(mesentery).not.toBe(bowel);
    expect(mesentery).toBe(structureColour({ base: "#b8916b", concept: "mesoappendix", index: 5 }));
    expect(structureColour({ base: "#b8916b", concept: "appendix", index: 1 })).toBe(
      structureColour({ base: "#b8916b", concept: "ascending colon", index: 7 }));
  });

  it("leaves vessels, bone and muscle their own colour", () => {
    /* Found against the real bundles: the splenic artery came out spleen
       purple, the renal artery kidney brown, and "digastric" — a muscle —
       matched /gastric/ and painted as stomach. An artery is red wherever it
       runs; that convention outranks any organ it happens to be named after. */
    const artery = "#c05245";
    expect(structureColour({ base: artery, concept: "splenic artery", index: 4, system: "arterial" }))
      .not.toBe(structureColour({ base: "#b8916b", concept: "spleen", index: 0, system: "lymphatic" }));
    for (const [concept, system] of [
      ["splenic artery", "arterial"], ["renal artery", "arterial"],
      ["caudate lobe branch of right portal vein", "venous"], ["left digastric", "muscular"],
    ]) {
      const c = structureColour({ base: artery, concept, index: 3, system });
      for (const [, tint] of ORGAN_TINTS) expect(c).not.toBe(tint);
    }
  });

  it("is deterministic — the same structure is the same colour every time", () => {
    const a = structureColour({ base: "#527c9f", concept: "some tributary", index: 11 });
    const b = structureColour({ base: "#527c9f", concept: "some tributary", index: 11 });
    expect(a).toBe(b);
  });

  it("separates unconventional structures from each other", () => {
    /* The failure this guards is the one that started it: everything in a
       system coming out the same colour. Forty-six is the digestive count. */
    const out = [];
    for (let i = 0; i < 46; i++) out.push(structureColour({ base: "#b8916b", concept: `thing ${i}`, index: i }));
    expect(new Set(out).size).toBe(46);

    // And separated enough to see, not merely different by one bit.
    const sorted = [...out].sort();
    for (let i = 1; i < sorted.length; i++) {
      expect(Math.abs(lum(sorted[i]) - lum(sorted[i - 1]))).toBeLessThan(0.5);
    }
    const lums = out.map(lum);
    expect(Math.max(...lums) - Math.min(...lums)).toBeGreaterThan(0.12);
  });

  it("stays inside a readable lightness range", () => {
    for (let i = 0; i < 200; i++) {
      const l = lum(structureColour({ base: "#b8916b", concept: `x${i}`, index: i }));
      expect(l).toBeGreaterThanOrEqual(0.17);
      expect(l).toBeLessThanOrEqual(0.83);
    }
  });

  it("round-trips HSL", () => {
    for (const hex of ["#b8916b", "#527c9f", "#ffffff", "#000000", "#7d9e55"]) {
      const rgb = hex2rgb(hex);
      const back = hsl2rgb(rgb2hsl(rgb)).map(Math.round);
      expect(back).toEqual(rgb);
    }
  });
});
