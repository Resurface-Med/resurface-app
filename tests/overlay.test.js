import { describe, it, expect } from "vitest";
import { overlayOps } from "../src/lib/overlay.js";
import { GEN_ID_BASE } from "../src/data/index.js";

const base = () => ({
  pStats: { 1: { correct: 1, total: 2 } },
  srCards: {},
  bookmarks: [5],
  activity: { "2026-10-19": 3 },
  streak: { streak: 1, longest: 4, lastDate: "2026-10-18" },
  dailyGoal: 20,
  displayName: "A",
  questionEdits: {},
  generated: [
    { id: GEN_ID_BASE + 7, q: "Old", deckId: "d2", createdAt: "x", gen: true },
    { id: GEN_ID_BASE + 8, q: "Other", deckId: "d1", createdAt: "y", gen: true },
  ],
  decks: [
    { id: "d1", name: "Top", parentId: null, position: 1024 },
    { id: "d2", name: "Child", parentId: "d1", position: 1024 },
    { id: "d3", name: "Grandchild", parentId: "d2", position: 1024 },
    { id: "d4", name: "Elsewhere", parentId: null, position: 2048 },
  ],
  featured: { roots: [{ id: "f1", hidden: false }], decks: [], questions: [] },
});

describe("overlayOps", () => {
  it("returns the snapshot untouched with nothing pending", () => {
    const s = base();
    expect(overlayOps(s, [])).toBe(s);
  });

  it("puts answers given offline back over an older snapshot", () => {
    const s = base();
    const out = overlayOps(s, [
      { kind: "practice", questionId: 1, correct: 2, total: 3 },
      { kind: "practice", questionId: 9, correct: 0, total: 1 },
      { kind: "sr", questionId: 1, card: { interval: 1, repetitions: 1 } },
      { kind: "activity", day: "2026-10-19", count: 5 },
      { kind: "streak", current: 2, longest: 4, lastDate: "2026-10-19" },
      { kind: "study-time", seconds: 90 },
    ]);
    expect(out.pStats).toEqual({ 1: { correct: 2, total: 3 }, 9: { correct: 0, total: 1 } });
    expect(out.srCards[1]).toEqual({ interval: 1, repetitions: 1 });
    expect(out.activity["2026-10-19"]).toBe(5);
    expect(out.streak).toEqual({ streak: 2, longest: 4, lastDate: "2026-10-19" });
    expect(out.studySeconds).toBe(90);
    expect(overlayOps(out, [{ kind: "study-time", seconds: 40 }]).studySeconds).toBe(90);
    expect(overlayOps(out, [{ kind: "study-time", seconds: 120 }]).studySeconds).toBe(120);
    expect(out.studySeconds).toBe(90);
    expect(overlayOps(out, [{ kind: "study-time", seconds: 40 }]).studySeconds).toBe(90);
    expect(overlayOps(out, [{ kind: "study-time", seconds: 120 }]).studySeconds).toBe(120);
    /* The input is not changed. */
    expect(s.pStats[1].total).toBe(2);
  });

  it("is harmless to apply twice — every op is an absolute value", () => {
    const ops = [{ kind: "practice", questionId: 1, correct: 2, total: 3 }, { kind: "bookmark-add", questionId: 6 }];
    const once = overlayOps(base(), ops);
    expect(overlayOps(once, ops)).toEqual(once);
  });

  it("keeps the order bookmarks were added and removed in", () => {
    const out = overlayOps(base(), [
      { kind: "bookmark-add", questionId: 6 },
      { kind: "bookmark-remove", questionId: 5 },
      { kind: "bookmark-add", questionId: 5 },
      { kind: "bookmark-remove", questionId: 6 },
    ]);
    expect(out.bookmarks).toEqual([5]);
  });

  it("applies deck renames and moves in app shape", () => {
    const out = overlayOps(base(), [{ kind: "deck-update", deckId: "d2", patch: { name: "Renamed", parent_id: null, position: 512 } }]);
    expect(out.decks.find(d => d.id === "d2")).toEqual({ id: "d2", name: "Renamed", parentId: null, position: 512 });
  });

  it("deletes a deck with everything under it, as the database cascades", () => {
    const out = overlayOps(base(), [{ kind: "deck-delete", deckId: "d1" }]);
    expect(out.decks.map(d => d.id)).toEqual(["d4"]);
    expect(out.generated).toEqual([]);
  });

  it("edits, moves and removes your own questions by their app id", () => {
    const out = overlayOps(base(), [
      { kind: "generated-update", id: 7, payload: { q: "New" } },
      { kind: "generated-update", id: 8, payload: { q: "Moved" }, deckId: "d4" },
    ]);
    expect(out.generated[0]).toMatchObject({ id: GEN_ID_BASE + 7, q: "New", deckId: "d2", createdAt: "x", gen: true });
    expect(out.generated[1]).toMatchObject({ q: "Moved", deckId: "d4" });
    expect(overlayOps(base(), [{ kind: "generated-remove", id: 7 }]).generated.map(q => q.id)).toEqual([GEN_ID_BASE + 8]);
  });

  it("covers profile fields, goal, corrections, resets and hidden Resurface decks", () => {
    const out = overlayOps(base(), [
      { kind: "profile", displayName: "B", introSeen: true },
      { kind: "goal", goal: 40 },
      { kind: "question-edit", questionId: 3, payload: { q: "Fixed" } },
      { kind: "featured-hide", deckId: "f1", hide: true },
      { kind: "flag", questionId: 1, reason: "wrong" },
    ]);
    expect(out.displayName).toBe("B");
    expect(out.introSeen).toBe(true);
    expect(out.dailyGoal).toBe(40);
    expect(out.questionEdits[3]).toEqual({ q: "Fixed" });
    expect(out.featured.roots[0].hidden).toBe(true);
    const reset = overlayOps(base(), [{ kind: "practice-clear" }, { kind: "sr-clear" }]);
    expect(reset.pStats).toEqual({});
    expect(reset.srCards).toEqual({});
  });
});
