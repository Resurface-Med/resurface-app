import { describe, expect, it } from "vitest";
import { focusNote } from "./formatExplain";

const note = "The lede.\n\n**Causes**\n- ==Shared line==\n- Line about this question\n- Another, with $& in it";

describe("focusNote", () => {
  it("moves the highlight to this question's line", () => {
    expect(focusNote(note, ["Line about this question"])).toBe(
      "The lede.\n\n**Causes**\n- Shared line\n- ==Line about this question==\n- Another, with $& in it");
  });
  it("marks more than one line, and headings", () => {
    const out = focusNote(note, ["Causes", "Another, with $& in it"]);
    expect(out).toContain("**==Causes==**");
    expect(out).toContain("- ==Another, with $& in it==");
  });
  it("keeps the note's own highlight when there is none, or the line has gone", () => {
    expect(focusNote(note, undefined)).toBe(note);
    expect(focusNote(note, [])).toBe(note);
    expect(focusNote(note, ["Not in the note"])).toBe(note);
  });
});
