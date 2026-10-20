import { describe, it, expect } from "vitest";
import { sessionLabel } from "../src/lib/sessionLabel.js";

const q = (...path) => ({ path: path.map((name, i) => ({ id: path.slice(0, i + 1).join("/"), name })) });

describe("sessionLabel", () => {
  it("names a deck by the one its questions share, not by counting its topics", () => {
    const renal = ["Glomerulus", "Physiology", "AKI", "Nephron", "Diuretics"].map(t => q("Year 2", "Renal", t));
    expect(sessionLabel(renal)).toBe("Year 2 › Renal");
  });
  it("one deck: its last two levels", () => {
    expect(sessionLabel([q("Year 2", "Renal", "Glomerulus"), q("Year 2", "Renal", "Glomerulus")])).toBe("Renal › Glomerulus");
    expect(sessionLabel([q("Year 2", "Renal"), q("Year 2", "Renal")])).toBe("Year 2 › Renal");
  });
  it("two side by side are named; more are counted at that level", () => {
    expect(sessionLabel([q("Year 2", "Renal", "AKI"), q("Year 2", "Cardio", "MI")])).toBe("Year 2 › Renal and Cardio");
    expect(sessionLabel([q("Year 2", "Renal", "AKI"), q("Year 2", "Renal", "CKD"), q("Year 2", "Cardio"), q("Year 2", "Resp")])).toBe("Year 2 · 3 decks");
  });
  it("across top decks", () => {
    expect(sessionLabel([q("Year 1", "A"), q("Year 2", "B")])).toBe("Year 1 and Year 2");
    expect(sessionLabel([q("Year 1"), q("Year 2"), q("Mine")])).toBe("3 decks");
  });
  it("falls back for nothing", () => {
    expect(sessionLabel([])).toBe("Practice");
  });
});
