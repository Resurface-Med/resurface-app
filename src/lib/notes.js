import { createContext, useContext } from "react";

/**
 * My notes (2026-10-30, migration 0063): a student's own note on a question.
 *
 * App holds them, { [questionId]: { body, at } }, and hands them down
 * through this context with `setNote(id, body)`, so a question card can read
 * and write its note without every screen between App and the card passing
 * them along. Outside the provider (previews) notes are simply off.
 */
export const NotesContext = createContext(null);

export function useNotes() {
  return useContext(NotesContext);
}

/* The notes that have something in them, newest first, each with its
   question; notes whose question is no longer in the bank are left out. */
export function notedQuestions(notes, questions) {
  if (!notes) return [];
  const byId = new Map(questions.map(q => [q.id, q]));
  return Object.entries(notes)
    .filter(([, n]) => n?.body?.trim())
    .map(([id, n]) => ({ q: byId.get(Number(id)), note: n }))
    .filter(x => x.q)
    .sort((a, b) => String(b.note.at ?? "").localeCompare(String(a.note.at ?? "")));
}

/*
 * The notes page's tree, built only from what has notes: a lecture appears
 * if one of its questions has a note, a topic inside it likewise, and
 * nothing else. Lectures are ordered by their newest note, topics within a
 * lecture the same way, so what you were just writing about is on top.
 *
 * [{ key, path: ["Year 2", "Renal", …], at, topics: [{ title, items: [{ q, note }] }] }]
 * A question with no topic note goes under a topic titled null.
 */
export function groupNotes(items) {
  const lectures = new Map();
  for (const it of items) {
    const path = (it.q.path ?? []).map(p => p.name).filter(Boolean);
    const key = path.join(" › ") || "Other questions";
    if (!lectures.has(key)) lectures.set(key, { key, path, at: it.note.at, topics: new Map() });
    const lec = lectures.get(key);
    const title = it.q.topic?.title ?? null;
    if (!lec.topics.has(title)) lec.topics.set(title, { title, at: it.note.at, items: [] });
    lec.topics.get(title).items.push(it);
  }
  return [...lectures.values()].map(l => ({ ...l, topics: [...l.topics.values()] }));
}

/*
 * The same notes as folders, the way Study shows decks (2026-10-30, Rafil:
 * "in a folder called Year 2, then Renal, then Medicine"): one node per
 * level of the deck path, each holding only what has notes under it. A
 * lecture (the last level) holds its notes by topic.
 *
 * Node: { key, name, count, at, kids: Node[], topics: [{ title, items }] }
 */
export function noteTree(items) {
  const root = { key: "", kids: new Map(), topics: new Map(), count: 0, at: "" };
  for (const it of items) {
    const path = (it.q.path ?? []).map(p => p.name).filter(Boolean);
    const segs = path.length ? path : ["Other questions"];
    let node = root;
    node.count++;
    segs.forEach((name, i) => {
      const key = segs.slice(0, i + 1).join(" › ");
      if (!node.kids.has(key)) node.kids.set(key, { key, name, kids: new Map(), topics: new Map(), count: 0, at: it.note.at });
      node = node.kids.get(key);
      node.count++;
    });
    const title = it.q.topic?.title ?? null;
    if (!node.topics.has(title)) node.topics.set(title, { title, items: [] });
    node.topics.get(title).items.push(it);
  }
  const done = n => ({ ...n, kids: [...n.kids.values()].map(done), topics: [...n.topics.values()] });
  return done(root).kids;
}
