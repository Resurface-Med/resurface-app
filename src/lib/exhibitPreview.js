/**
 * The exhibit sample, shown under Ready-made decks so the investigations
 * list and the results tables can actually be opened. The questions live in
 * content/exhibits and the app otherwise ships no bank, which is why a push
 * of the renderer left nothing on screen.
 *
 * Ids sit at 8_000_000, clear of the bank (1–510) and of your own questions
 * (1_000_000 + a database id). Progress keys on a bare id with no owner, so
 * answering one records like any other question.
 */
import questions from "../../content/exhibits/test-deck.json";

export const EXHIBIT_DECK_ID = "e1b17dec-0000-4000-8000-000000000001";
const FIRST_ID = 8_000_000;
const HIDE_KEY = "rs_exhibit_preview_hidden";

export function exhibitPreviewHidden() {
  try { return localStorage.getItem(HIDE_KEY) === "1"; }
  catch { return false; }
}

export function setExhibitPreviewHidden(hide) {
  try { localStorage.setItem(HIDE_KEY, hide ? "1" : "0"); } catch { /* private mode */ }
}

export function exhibitPreview() {
  return {
    root: {
      id: EXHIBIT_DECK_ID,
      top: EXHIBIT_DECK_ID,
      name: "Exhibits",
      byline: "Resurface",
      hidden: exhibitPreviewHidden(),
      position: -2_000_000_000,
    },
    deck: {
      id: EXHIBIT_DECK_ID,
      name: "Exhibits",
      parentId: null,
      position: -2_000_000_000,
      featured: true,
      root: EXHIBIT_DECK_ID,
      byline: "Resurface",
    },
    questions: questions.map((q, i) => ({
      ...q,
      id: FIRST_ID + i + 1,
      featured: true,
      deckId: EXHIBIT_DECK_ID,
    })),
  };
}

/** Adds the sample once. A copy already in the list is left as it is, so a
    hide is not undone by the next refresh. */
export function withExhibitPreview(featured) {
  const base = featured ?? { roots: [], decks: [], questions: [] };
  const decks = base.decks ?? [];
  if (decks.some(d => d.id === EXHIBIT_DECK_ID)) return base;
  const preview = exhibitPreview();
  return {
    ...base,
    roots: [...(base.roots ?? []), preview.root],
    decks: [...decks, preview.deck],
    questions: [...(base.questions ?? []), ...preview.questions],
  };
}
