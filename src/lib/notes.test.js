import { describe, it, expect } from "vitest";
import { notedQuestions, groupNotes } from "./notes";

const qs = [
  { id: 1, q: "A", path: [{ name: "Year 2" }, { name: "Renal" }], topic: { title: "AKI" } },
  { id: 2, q: "B", path: [{ name: "Year 2" }, { name: "Renal" }], topic: { title: "AKI" } },
  { id: 3, q: "C", path: [{ name: "Year 1" }, { name: "Resp" }], topic: { title: "Asthma" } },
  { id: 4, q: "D", path: [{ name: "Year 1" }, { name: "Resp" }] },
];

describe("notes", () => {
  it("keeps only questions with a note, newest first", () => {
    const out = notedQuestions({ 1: { body: "x", at: "2026-10-01" }, 3: { body: "y", at: "2026-10-05" }, 2: { body: "  ", at: "2026-10-09" }, 99: { body: "gone", at: "2026-10-09" } }, qs);
    expect(out.map(x => x.q.id)).toEqual([3, 1]);
  });
  it("groups by lecture then topic, only what has notes", () => {
    const g = groupNotes(notedQuestions({ 1: { body: "x", at: "2026-10-01" }, 2: { body: "z", at: "2026-10-02" }, 4: { body: "w", at: "2026-10-03" } }, qs));
    expect(g.map(l => l.key)).toEqual(["Year 1 › Resp", "Year 2 › Renal"]);
    expect(g[1].topics).toHaveLength(1);
    expect(g[1].topics[0].items.map(x => x.q.id)).toEqual([2, 1]);
    expect(g[0].topics[0].title).toBe(null);
  });
});

import { overlayOps } from "./overlay";
describe("notes offline", () => {
  it("queued note writes are laid over a snapshot", () => {
    const s = overlayOps({ notes: { 1: { body: "a", at: "x" } } }, [
      { kind: "note-set", questionId: 2, body: "b", updatedAt: "y" },
      { kind: "note-remove", questionId: 1 },
    ]);
    expect(s.notes).toEqual({ 2: { body: "b", at: "y" } });
  });
  it("leaves notes null when they couldn't be loaded", () => {
    expect(overlayOps({ notes: null }, [{ kind: "note-set", questionId: 2, body: "b" }]).notes).toBe(null);
  });
});
