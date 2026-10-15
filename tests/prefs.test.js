import { describe, it, expect } from "vitest";
import { loadPrefs, setPref } from "../src/lib/prefs.js";

describe("prefs", () => {
  it("saves a change, once, and only when it is a change", () => {
    const saved = [];
    loadPrefs({ showAllOptions: false }, patch => saved.push(patch));
    setPref("showAllOptions", true);
    setPref("showAllOptions", true);
    setPref("showAllOptions", false);
    expect(saved).toEqual([{ showAllOptions: true }, { showAllOptions: false }]);
  });

  it("does not save what it was loaded with", () => {
    const saved = [];
    loadPrefs({ showAllOptions: true }, patch => saved.push(patch));
    expect(saved).toEqual([]);
  });
});
