import { describe, expect, it } from "vitest";
import { parseBlocks } from "./formatExplain";

describe("parseBlocks", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(parseBlocks("One line\nstill one.\n\nTwo.")).toEqual([
      { type: "p", text: "One line still one." },
      { type: "p", text: "Two." },
    ]);
  });
  it("groups bullets and numbered steps", () => {
    expect(parseBlocks("Intro.\n- a\n- b\n\n1. first\n2) second\nAfter.")).toEqual([
      { type: "p", text: "Intro." },
      { type: "ul", items: ["a", "b"] },
      { type: "ol", items: ["first", "second"] },
      { type: "p", text: "After." },
    ]);
  });
  it("shows a heading as a bold line", () => {
    expect(parseBlocks("## Why\nBecause.")).toEqual([
      { type: "p", text: "**Why**" },
      { type: "p", text: "Because." },
    ]);
  });
  it("copes with nothing", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks(null)).toEqual([]);
  });
});
