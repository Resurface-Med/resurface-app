import { describe, it, expect } from "vitest";
import {
  toDeckFile, serializeDeckFile, parseDeckFile, planDeckUpdate, deckFileName, DECK_FILE_INSTRUCTIONS,
} from "../src/lib/deckFile.js";

const live = {
  id: 1000001,
  q: "Which hormone falls in type 1 diabetes?",
  opts: ["alpha", "beta", "gamma", "delta", "epsilon"],
  ans: 2,
  exp: "Because gamma.",
  optExp: ["no a", "no b", null, "no d", "no e"],
  path: [{ id: "d", name: "Endocrine" }, { id: "l", name: "Glucose" }],
  img: "pic.png",
  exhibit: { kind: "table" },
  featured: true,
};
const other = { ...live, id: 1000002, q: "Second stem.", img: undefined, exhibit: undefined };

function fileOf(questions, extra = {}) {
  return { format: 1, deck: "Endocrine", count: questions.length, questions, ...extra };
}

describe("toDeckFile", () => {
  it("writes the correct option as its text, and tells the other model the rules", () => {
    const file = toDeckFile("Endocrine", [live], "d");
    expect(file.instructions).toBe(DECK_FILE_INSTRUCTIONS);
    expect(file.count).toBe(1);
    expect(file.questions[0]).toMatchObject({
      id: 1000001,
      deck: "Endocrine / Glucose",
      correct: "gamma",
      why: ["no a", "no b", "", "no d", "no e"],
    });
    expect(file.instructions).toMatch(/Do not change id/);
    expect(file.instructions).toMatch(/character for character/);
  });
});

describe("parseDeckFile", () => {
  const file = toDeckFile("Endocrine", [live], "d");
  const text = serializeDeckFile(file);

  it("reads its own file back, including one wrapped for chat", () => {
    expect(parseDeckFile(text).questions).toHaveLength(1);
    expect(parseDeckFile(`Here is the deck.\n\n\`\`\`json\n${text}\n\`\`\`\nLet me know.`).questions[0].id).toBe(1000001);
    expect(parseDeckFile(JSON.stringify(text)).questions[0].correct).toBe("gamma");
  });

  it("reads a bare array and one question per line", () => {
    expect(parseDeckFile(JSON.stringify(file.questions)).questions).toHaveLength(1);
    const line = JSON.stringify(file.questions[0]);
    expect(parseDeckFile(`${line}\n{bad\n${line}`).broken).toEqual([2]);
    expect(parseDeckFile(`${line}\n{bad\n${line}`).questions).toHaveLength(2);
  });

  it("refuses a file that is not the deck, or a format it does not know", () => {
    expect(parseDeckFile("hello").error).toMatch(/isn't the deck/);
    expect(parseDeckFile("").error).toMatch(/empty/);
    expect(parseDeckFile(JSON.stringify({ format: 2, questions: [] })).error).toMatch(/newer deck format/);
  });
});

describe("planDeckUpdate", () => {
  it("changes nothing when the file comes back as it left", () => {
    const parsed = parseDeckFile(serializeDeckFile(toDeckFile("Endocrine", [live, other], "d")));
    const plan = planDeckUpdate(parsed, [live, other]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(2);
    expect(plan.missing).toBe(0);
    expect(plan.skipped).toEqual([]);
  });

  it("updates the question and keeps the picture and the exhibit", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    const plan = planDeckUpdate(fileOf([{ ...row, exp: "Insulin is absent." }]), [live]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].payload).toMatchObject({
      exp: "Insulin is absent.", ans: 2, img: "pic.png", exhibit: { kind: "table" },
    });
    expect(plan.updates[0].featured).toBe(true);
  });

  it("follows the option text when the options are reordered", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    const plan = planDeckUpdate(fileOf([{
      ...row,
      options: ["gamma", "alpha", "beta", "delta", "epsilon"],
      correct: "gamma",
      why: ["", "no a", "no b", "no d", "no e"],
    }]), [live]);
    expect(plan.updates[0].payload.ans).toBe(0);
    expect(plan.updates[0].payload.opts[0]).toBe("gamma");
    expect(plan.updates[0].payload.optExp[1]).toBe("no a");
  });

  it("keeps each note with its option when why is left out and the options move", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    delete row.why;
    const plan = planDeckUpdate(fileOf([{
      ...row,
      options: ["epsilon", "delta", "gamma", "beta", "alpha"],
      correct: "gamma",
    }]), [live]);
    expect(plan.updates[0].payload.ans).toBe(2);
    expect(plan.updates[0].payload.optExp).toEqual(["no e", "no d", null, "no b", "no a"]);
  });

  it("accepts a letter, an index, or a letter glued to the front of the text", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    for (const correct of ["C", "c)", 2, "2", "C. gamma"]) {
      const plan = planDeckUpdate(fileOf([{ ...row, correct }]), [live]);
      expect(plan.skipped, String(correct)).toEqual([]);
      expect(plan.updates, String(correct)).toEqual([]);
    }
  });

  it("does not save a row whose answer is no longer one of the options", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    row.options[2] = "insulin";
    const plan = planDeckUpdate(fileOf([row]), [live]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped[0].skip).toBe("correct doesn't match any option");
    expect(plan.missing).toBe(0);
  });

  it("does not add a question, and does not delete one the file dropped", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    const plan = planDeckUpdate(fileOf([
      { ...row, id: undefined },
      { ...row, id: 999 },
    ], { count: 4 }), [live, other]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped.map(s => s.skip)).toEqual(["no id", "not in this deck"]);
    expect(plan.missing).toBe(2);
    expect(plan.truncated).toBe(true);
  });

  it("skips a row that would break the question, and keeps the earlier copy when a later one is the one kept", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    const bad = [
      { ...row, options: ["only", "four", "here", "nope"] },
      { ...row, exp: "" },
      { ...row, options: ["a", "a", "b", "c", "d"] },
      { ...row, exp: undefined },
    ];
    delete bad[3].exp;
    const plan = planDeckUpdate(fileOf(bad.map((r, i) => ({ ...r, id: 1000001 + i }))), [live, other, { ...other, id: 1000003 }, { ...other, id: 1000004 }]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped.map(s => s.skip)).toEqual([
      "needs exactly 5 options",
      "the explanation is empty",
      "two options are the same",
      "a field is missing",
    ]);
  });

  it("uses the last copy of a repeated id", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    const plan = planDeckUpdate(fileOf([
      { ...row, exp: "First." },
      { ...row, exp: "Second." },
    ]), [live]);
    expect(plan.repeated).toBe(1);
    expect(plan.updates[0].payload.exp).toBe("Second.");
  });

  it("clears a note written on the correct option", () => {
    const row = toDeckFile("Endocrine", [live], "d").questions[0];
    row.why[2] = "this is actually right";
    row.exp = "Insulin is absent.";
    const plan = planDeckUpdate(fileOf([row]), [live]);
    expect(plan.updates[0].payload.optExp[2]).toBe(null);
  });
});

describe("deckFileName", () => {
  it("keeps the deck name and drops characters a file name cannot hold", () => {
    expect(deckFileName("Year 2 / Endocrine")).toBe("Year 2 Endocrine.json");
    expect(deckFileName("")).toBe("deck.json");
  });
});
