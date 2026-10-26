import { describe, it, expect } from "vitest";
import { decksLine, personalNote, yearFolder, yearDecks } from "../src/lib/firstRun.js";

const featured = {
  roots: [
    { id: "pr", top: "y1", name: "Year 1", byline: "Rafil" },
    { id: "re", top: "y1", name: "Year 1", byline: "Rafil" },
    { id: "rn", top: "y2", name: "Year 2", byline: "Jacob" },
    { id: "en", top: "y2", name: "Year 2", byline: "Jacob" },
    { id: "hd", top: "hd", name: "Endocrinology", byline: "Rayan", hidden: true },
  ],
  decks: [
    { id: "y1", name: "Year 1", parentId: null, folder: true },
    { id: "y2", name: "Year 2", parentId: null, folder: true },
    { id: "pr", name: "Principles", parentId: null },
    { id: "re", name: "Respiratory", parentId: null },
    { id: "rn", name: "Renal", parentId: null },
    { id: "en", name: "Endocrine", parentId: null },
    { id: "pr-b", name: "Biochemistry", parentId: "pr", position: 2048 },
    { id: "pr-a", name: "Anatomy", parentId: "pr", position: 1024 },
    { id: "pr-a1", name: "Intro", parentId: "pr-a", position: 1024 },
  ],
  questions: [
    { id: 11, deckId: "pr-b" }, { id: 12, deckId: "pr-b" },
    { id: 1, deckId: "pr-a1" }, { id: 2, deckId: "pr-a1" }, { id: 3, deckId: "pr-a1" },
    { id: 4, deckId: "pr-a" },
    { id: 21, deckId: "rn" },
  ],
};

describe("first run", () => {
  it("names your year, and no topic", () => {
    expect(decksLine(featured, 1)).toBe("Use the ready-made Year 1 decks.");
    expect(decksLine(featured, 2)).toBe("Use the ready-made Year 2 decks.");
  });

  it("lists every year for a year with no decks", () => {
    expect(decksLine(featured, 4)).toBe("Use the ready-made decks. So far there are decks for Year 1 and Year 2, and we're working on the other years.");
    expect(decksLine(featured, null)).toMatch(/^Use the ready-made decks\. So far/);
  });

  it("leaves hidden decks out", () => {
    expect(yearDecks({ ...featured, roots: featured.roots.map(r => ({ ...r, name: "Year 2" })) }, 2).map(d => d.id)).not.toContain("hd");
  });

  it("fills {decks} in the note and leaves a note without it alone", () => {
    const note = { title: "Welcome", body: "Hi.\n\n2. Use the decks. {decks}\n\nRafil" };
    expect(personalNote(note, featured, 2).body).toBe("Hi.\n\n2. Use the decks. Use the ready-made Year 2 decks.\n\nRafil");
    const plain = { title: "x", body: "No token." };
    expect(personalNote(plain, featured, 1)).toBe(plain);
  });

  it("opens your year's heading, not a deck", () => {
    expect(yearFolder(featured, 1)).toBe("y1");
    expect(yearFolder(featured, 2)).toBe("y2");
    expect(yearFolder(featured, 5)).toBeNull();
  });
});
