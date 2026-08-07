// Loads the question bank out of content/decks/.
//
// The decks live outside src/ because they're content, not code — hand-edited
// far more often than the app itself, and reviewed as content in their own
// right. This module is the only place that knows how they're stored, so
// moving them behind an API later means changing this file and nothing else.

import anatomy from "../../content/decks/anatomy.json";
import biochemistry from "../../content/decks/biochemistry.json";
import embryology from "../../content/decks/embryology.json";
import genetics from "../../content/decks/genetics.json";
import histology from "../../content/decks/histology.json";
import immunology from "../../content/decks/immunology.json";
import pathology from "../../content/decks/pathology.json";
import pharmacology from "../../content/decks/pharmacology.json";
import physiology from "../../content/decks/physiology.json";

const DECKS = [
  biochemistry, genetics, physiology, immunology, pathology,
  histology, pharmacology, embryology, anatomy,
];

export const QUESTIONS = DECKS.flatMap(d => d.questions);

// Deck name -> its categories, in the order they should appear in filters.
export const DECK_MAP = Object.fromEntries(
  DECKS.map(d => [d.deck, d.categories]),
);
