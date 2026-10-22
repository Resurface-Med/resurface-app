import { describe, expect, it } from "vitest";
import { normalizeHex, themeTokens } from "../src/lib/themeColor.js";

function contrast(hex, against) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = c => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const a = L(rgb);
  const b = L(against);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("themeTokens", () => {
  it("uses the picked colour as the field", () => {
    const t = themeTokens("#D0216D");
    expect(t.fieldTone).toBe("dark");
    expect(t.vars["--c-bg"]).toBe("#d0216d");
    expect(t.vars["--c-body-bg"]).toBe("#d0216d");
    expect(t.vars["--c-on-field"]).toBe("#ffffff");
    expect(t.vars["--c-accent"]).toBe("#d0216d");
  });

  it("keeps a light colour and switches the type", () => {
    const picked = "#f7d6e6";
    const t = themeTokens(picked);
    expect(t.fieldTone).toBe("light");
    expect(t.vars["--c-bg"]).toBe(picked);
    expect(t.vars["--c-on-field"]).not.toBe("#ffffff");
    expect(contrast(t.vars["--c-on-field"], [247, 214, 230])).toBeGreaterThan(4.5);
    expect(contrast(t.vars["--c-accent"], [255, 255, 255])).toBeGreaterThan(4.6);
    const accent = parseInt(t.vars["--c-accent"].slice(1), 16);
    const r = (accent >> 16) & 255;
    const g = (accent >> 8) & 255;
    const b = accent & 255;
    expect(r).toBeGreaterThan(g + 30);
    expect(r).toBeGreaterThan(b + 30);
    expect(t.vars["--c-field-object-ink"]).toBe("#ffffff");
  });

  it("rejects a colour that is not a hex", () => {
    expect(normalizeHex("pink")).toBe("");
    expect(normalizeHex("#fff")).toBe("");
    expect(normalizeHex("#aabbcc")).toBe("#aabbcc");
    expect(themeTokens("nope")).toBeNull();
  });
});
