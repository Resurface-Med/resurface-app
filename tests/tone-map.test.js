import { describe, it, expect } from "vitest";
import { acesFilmic, preToneMap, linearToSrgb, srgbToLinear } from "../src/lib/toneMap.js";

const toHex = lin =>
  "#" + lin.map(c => Math.round(linearToSrgb(c) * 255).toString(16).padStart(2, "0")).join("");

describe("ACES round trip", () => {
  it("confirms the problem: plain white tone maps to visible grey", () => {
    const white = [1, 1, 1].map(srgbToLinear);
    const out = toHex(acesFilmic(white, 1.15));
    expect(out).not.toBe("#ffffff");
    // Not a subtle difference — this is the grey rectangle in a white sheet.
    expect(Math.round(linearToSrgb(acesFilmic(white, 1.15)[0]) * 255)).toBeLessThan(250);
  });

  for (const [label, hex] of [
    ["white", "#ffffff"],
    ["off-white sheet", "#fbfcfe"],
    ["dark sheet", "#141a2b"],
    ["mid grey", "#808080"],
  ]) {
    it(`pre-corrects ${label} so it displays unchanged`, () => {
      for (const exposure of [1, 1.15]) {
        const pre = preToneMap(hex, exposure);
        expect(pre).not.toBeNull();
        const shown = toHex(acesFilmic(pre, exposure));
        // Within one 8-bit step per channel.
        for (let i = 1; i < 7; i += 2) {
          const a = parseInt(shown.slice(i, i + 2), 16);
          const b = parseInt(hex.slice(i, i + 2), 16);
          expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it("returns null for a colour it cannot read", () => {
    expect(preToneMap("var(--c-card-solid)")).toBeNull();
  });
});
