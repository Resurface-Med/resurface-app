import { describe, it, expect } from "vitest";
import { unwrapLatex, splitMarks } from "../src/lib/formatExplain.js";

describe("unwrapLatex", () => {
  it("turns $\\Delta G$ into ΔG", () => {
    expect(unwrapLatex("the large negative ($\\Delta G$) of ATP")).toBe(
      "the large negative (ΔG) of ATP"
    );
  });

  it("handles superscripts and subscripts", () => {
    expect(unwrapLatex("$\\Delta G^{0}$ and $Na^{+}$ and $H_2O$")).toBe(
      "ΔG⁰ and Na⁺ and H₂O"
    );
  });

  it("leaves ordinary prose alone", () => {
    expect(unwrapLatex("PFK-1 is irreversible.")).toBe("PFK-1 is irreversible.");
  });
});

describe("splitMarks", () => {
  it("keeps bold around converted latex", () => {
    const parts = splitMarks("due to **$\\Delta G$** of ATP");
    expect(parts).toEqual([
      { kind: "text", text: "due to " },
      { kind: "strong", text: "ΔG" },
      { kind: "text", text: " of ATP" },
    ]);
  });
});
