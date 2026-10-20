import { describe, it, expect } from "vitest";
import { sessionLabel } from "../src/lib/sessionLabel.js";

const q = (id, leaf, root = "Year 2") => ({ id, path: [{ id: "r", name: root }, { id: leaf, name: leaf }] });

describe("sessionLabel", () => {
  it("names one deck with its top deck", () => {
    expect(sessionLabel([q(1, "Renal"), q(2, "Renal")])).toBe("Year 2 › Renal");
  });
  it("counts decks under one top deck, or across several", () => {
    expect(sessionLabel([q(1, "Renal"), q(2, "Cardio")])).toBe("Year 2 · 2 decks");
    expect(sessionLabel([q(1, "Renal"), q(2, "Cardio", "Year 1")])).toBe("2 decks");
  });
  it("falls back for nothing", () => {
    expect(sessionLabel([])).toBe("Practice");
  });
});
