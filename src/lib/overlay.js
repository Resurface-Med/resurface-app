import { GEN_ID_BASE } from "../data";

/**
 * A snapshot with writes laid over it that the server may not have yet.
 *
 * Two places need it (2026-10-19, offline):
 *
 *   opening from the device's copy — anything still in the write queue is
 *   put back on, in case the app was closed before the copy was saved;
 *
 *   a load from the server — writes still queued, and writes made while the
 *   load was in flight, are not in what came back. Applied as it came, a
 *   question answered offline would show unanswered, and answering it again
 *   would count from the old total and lose one. Laying the writes over it
 *   keeps the screen where it was.
 *
 * Every op carries absolute values (a total, not "+1"; a whole card), so
 * applying one twice is harmless and order is all that matters: callers pass
 * them oldest first. Pure; the snapshot passed in is not changed.
 */
export function overlayOps(snap, ops) {
  if (!snap || !ops?.length) return snap;
  const s = {
    ...snap,
    pStats: { ...snap.pStats },
    srCards: { ...snap.srCards },
    bookmarks: [...(snap.bookmarks ?? [])],
    activity: { ...snap.activity },
    questionEdits: { ...snap.questionEdits },
    generated: [...(snap.generated ?? [])],
    decks: [...(snap.decks ?? [])],
  };
  for (const op of ops) {
    switch (op?.kind) {
      case "practice":
        s.pStats[op.questionId] = { correct: op.correct, total: op.total };
        break;
      case "sr":
        s.srCards[op.questionId] = op.card;
        break;
      case "bookmark-add":
        if (!s.bookmarks.includes(op.questionId)) s.bookmarks.push(op.questionId);
        break;
      case "bookmark-remove":
        s.bookmarks = s.bookmarks.filter(id => id !== op.questionId);
        break;
      case "activity":
        s.activity[op.day] = op.count;
        break;
      case "streak":
        s.streak = { streak: op.current, longest: op.longest, lastDate: op.lastDate };
        break;
      case "goal":
        s.dailyGoal = op.goal;
        break;
      case "profile":
        if (op.displayName !== undefined) s.displayName = op.displayName;
        if (op.nameChosen !== undefined) s.nameChosen = op.nameChosen;
        if (op.showOnLeaderboard !== undefined) s.showOnLeaderboard = op.showOnLeaderboard;
        if (op.marketingOptIn !== undefined) s.marketingOptIn = op.marketingOptIn;
        if (op.showAllOptions !== undefined) s.showAllOptions = op.showAllOptions;
        if (op.introSeen !== undefined) s.introSeen = op.introSeen;
        if (op.studyYear !== undefined) s.studyYear = op.studyYear;
        break;
      case "question-edit":
        s.questionEdits[op.questionId] = op.payload;
        break;
      case "generated-update": {
        const id = GEN_ID_BASE + Number(op.id);
        s.generated = s.generated.map(q => (q.id === id
          ? { ...op.payload, id, gen: true, deckId: op.deckId !== undefined ? op.deckId : q.deckId, createdAt: q.createdAt }
          : q));
        break;
      }
      case "generated-remove": {
        const id = GEN_ID_BASE + Number(op.id);
        s.generated = s.generated.filter(q => q.id !== id);
        break;
      }
      case "generated-clear":
        s.generated = [];
        break;
      case "practice-clear":
        s.pStats = {};
        break;
      case "sr-clear":
        s.srCards = {};
        break;
      case "deck-update": {
        const p = op.patch ?? {};
        s.decks = s.decks.map(d => (d.id === op.deckId ? {
          ...d,
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.parent_id !== undefined ? { parentId: p.parent_id } : {}),
          ...(p.position !== undefined ? { position: p.position } : {}),
        } : d));
        break;
      }
      case "deck-delete": {
        /* The database cascades to sub-decks and their questions. */
        const gone = new Set([op.deckId]);
        for (let grew = true; grew;) {
          grew = false;
          for (const d of s.decks) if (d.parentId && gone.has(d.parentId) && !gone.has(d.id)) { gone.add(d.id); grew = true; }
        }
        s.decks = s.decks.filter(d => !gone.has(d.id));
        s.generated = s.generated.filter(q => !gone.has(q.deckId));
        break;
      }
      case "ann-seen":
        s.announcementsSeenAt = op.seenAt;
        break;
      case "featured-hide":
        if (s.featured?.roots) {
          s.featured = { ...s.featured, roots: s.featured.roots.map(r => (r.id === op.deckId ? { ...r, hidden: op.hide } : r)) };
        }
        break;
      default:
        /* Flags, and anything that does not change what is drawn. */
        break;
    }
  }
  return s;
}
