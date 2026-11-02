import { describe, it, expect } from "vitest";
import { parseQuestionFile, UPLOAD_EXAMPLE } from "./questionUpload";

describe("question upload", () => {
  it("reads the Download deck shape", () => {
    const { drafts, problems } = parseQuestionFile(JSON.stringify(UPLOAD_EXAMPLE));
    expect(problems).toEqual([]);
    expect(drafts[0].ans).toBe(0);
    expect(drafts[0].optExp[0]).toBe(null);
    expect(drafts[0].optExp[1]).toMatch(/peroxidase/);
  });
  it("reads a bare array, the app's shape, letters and indexes", () => {
    const { drafts } = parseQuestionFile([
      { q: "a", opts: ["x", "y"], ans: 1, exp: "e" },
      { question: "b", options: ["p", "q", "r"], answer: "C" },
      { q: "c", options: ["One", "Two"], correct: "two" },
    ]);
    expect(drafts.map(d => d.ans)).toEqual([1, 2, 1]);
  });
  it("says why a row can't be used", () => {
    const { drafts, problems } = parseQuestionFile({ questions: [
      { q: "", options: ["a", "b"], correct: "a" },
      { q: "x", options: ["a"], correct: "a" },
      { q: "x", options: ["a", "b"], correct: "c" },
      { q: "x", options: ["a", "A"], correct: "a" },
      { q: "ok", options: ["a", "b"], correct: "b" },
    ] });
    expect(drafts).toHaveLength(1);
    expect(problems.map(p => p.row)).toEqual([1, 2, 3, 4]);
  });
  it("rejects what isn't JSON or a list", () => {
    expect(parseQuestionFile("{nope").problems[0].why).toMatch(/valid JSON/);
    expect(parseQuestionFile({ a: 1 }).problems[0].why).toMatch(/list of questions/);
  });
});
