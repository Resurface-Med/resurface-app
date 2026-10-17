import { describe, expect, it } from "vitest";
import { suggestFromNotes, suggestFromSlides } from "../src/lib/suggestCount.js";

const slide = (i, body) => `\n--- Slide ${i} ---\n${body}`;
const words = n => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const normal = "The glomerular filtration barrier has three layers: fenestrated endothelium, the basement membrane and podocytes.";

describe("suggestFromSlides", () => {
  it("counts a slide with content as one", () => {
    const text = Array.from({ length: 18 }, (_, i) => slide(i + 1, normal)).join("").trim();
    expect(suggestFromSlides(text)).toBe(18);
  });

  it("ignores titles and near-empty slides", () => {
    const text = [slide(1, "Renal physiology"), slide(2, "Questions?"), ...Array.from({ length: 10 }, (_, i) => slide(i + 3, normal))].join("").trim();
    expect(suggestFromSlides(text)).toBe(10);
  });

  it("counts a dense slide as one and a half", () => {
    const dense = normal.repeat(8);
    const text = Array.from({ length: 10 }, (_, i) => slide(i + 1, dense)).join("").trim();
    expect(suggestFromSlides(text)).toBe(15);
  });

  it("keeps between 5 and 30", () => {
    expect(suggestFromSlides([slide(1, normal), slide(2, normal)].join(""))).toBe(5);
    expect(suggestFromSlides(Array.from({ length: 80 }, (_, i) => slide(i + 1, normal)).join(""))).toBe(30);
  });

  it("reads PowerPoint's unnumbered markers too", () => {
    const text = Array.from({ length: 12 }, () => `\n--- Slide ---\n${normal}`).join("");
    expect(suggestFromSlides(text)).toBe(12);
  });

  it("has nothing to suggest for a PDF of pictures", () => {
    expect(suggestFromSlides([slide(1, ""), slide(2, "Fig 1")].join(""))).toBeNull();
    expect(suggestFromSlides("")).toBeNull();
  });
});

describe("suggestFromNotes", () => {
  it("is one per ~120 words, between 5 and 30", () => {
    expect(suggestFromNotes(words(1200))).toBe(10);
    expect(suggestFromNotes(words(200))).toBe(5);
    expect(suggestFromNotes(words(9000))).toBe(30);
  });
  it("says nothing for a line or two", () => {
    expect(suggestFromNotes("just a sentence")).toBeNull();
  });
});
