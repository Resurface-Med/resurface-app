/**
 * The exhibit sample belongs to the bobpattack account, as one of its own
 * decks. It is created the first time that account signs in. Anyone else
 * never downloads it, and it is not a ready-made deck.
 */
import { nextPosition } from "./deckOrder";
import { remote } from "./remote";

let started = false;

export function isExhibitAccount(user, displayName) {
  const who = [
    user?.email,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
    displayName,
  ].filter(Boolean).join(" ").toLowerCase();
  return who.includes("bobpattack");
}

export async function seedExhibitDeck({ user, displayName, decks, generated }) {
  if (started || !user?.id || !isExhibitAccount(user, displayName)) return null;
  if ((decks ?? []).some(d => !d.parentId && d.name === "Exhibits")) return null;
  started = true;
  try {
    const questions = (await import("../../content/exhibits/test-deck.json")).default;
    const position = nextPosition(decks ?? [], null);
    const created = await remote.createDeck(user.id, "Exhibits", null, position);
    const ids = await remote.addGenerated(user.id, questions, created.id);
    const deck = {
      id: created.id,
      name: "Exhibits",
      parentId: null,
      position,
      shareCode: created.share_code,
      createdAt: created.created_at,
    };
    const nextDecks = [...(decks ?? []), deck];
    const nextGenerated = [...(generated ?? [])];
    if (ids) {
      questions.forEach((q, i) => nextGenerated.push({
        ...q, id: ids[i], gen: true, deckId: created.id,
      }));
    }
    return { decks: nextDecks, generated: nextGenerated };
  } catch (err) {
    started = false;
    throw err;
  }
}
