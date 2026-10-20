/**
 * Past sessions (2026-10-20): each practice session, kept so it can be
 * continued, looked back through, or done again.
 *
 * A record holds question ids and what was picked — the option's text, not
 * its position, because options are shuffled afresh every time a question is
 * served. Rebuilding a session takes the questions as they are now: deleted
 * ones drop out, and an answer whose option has since been edited away reads
 * as unanswered rather than as a pick of something you never saw.
 *
 * Pure, so it can be tested; PracticeMode does the saving, App the loading.
 */

/* What a session was on, from the decks its questions sit in. */
export function sessionLabel(questions) {
  const qs = (questions ?? []).filter(Boolean);
  if (!qs.length) return "Practice";
  const pathOf = q => (q.path ?? []).map(p => p.name).filter(Boolean);
  const leaves = [...new Set(qs.map(q => pathOf(q).at(-1) ?? q.cat).filter(Boolean))];
  const roots = [...new Set(qs.map(q => pathOf(q)[0] ?? q.block).filter(Boolean))];
  if (leaves.length === 1) {
    const root = roots[0];
    return root && root !== leaves[0] ? `${root} › ${leaves[0]}` : leaves[0];
  }
  if (roots.length === 1) return `${roots[0]} · ${leaves.length} decks`;
  return `${leaves.length} decks`;
}

/* A session as it is now, as a record to save. */
export function toRecord({ sid, queue, sels, idx = 0, startedAt, finished = false, now = new Date().toISOString() }) {
  const items = (queue ?? []).map((q, i) => ({
    id: q.id,
    pick: sels?.[i] !== undefined && q.opts?.[sels[i]] !== undefined ? q.opts[sels[i]] : null,
  }));
  let answered = 0, correct = 0;
  (queue ?? []).forEach((q, i) => {
    if (sels?.[i] === undefined) return;
    answered += 1;
    if (sels[i] === q.ans) correct += 1;
  });
  return {
    id: sid,
    label: sessionLabel(queue),
    items,
    idx: Math.max(0, Math.min(idx, items.length - 1)),
    total: items.length,
    answered,
    correct,
    finished: Boolean(finished || (items.length > 0 && answered === items.length)),
    created_at: startedAt ?? now,
    updated_at: now,
  };
}

/*
 * A record back into a session on today's questions: { queue, sels, idx },
 * or null if none of its questions exist any more. `reshuffle` is
 * shuffleOptions, passed in so this stays pure.
 */
export function fromRecord(rec, liveById, reshuffle = q => q) {
  const queue = [];
  const sels = {};
  const at = new Map();
  (rec?.items ?? []).forEach((it, i) => {
    const live = liveById.get(it.id);
    if (!live) return;
    const q = reshuffle(live);
    at.set(i, queue.length);
    if (it.pick != null) {
      const j = q.opts.indexOf(it.pick);
      if (j !== -1) sels[queue.length] = j;
    }
    queue.push(q);
  });
  if (!queue.length) return null;
  /* The first question not yet answered from where you were — a save is
     made on answering, so `idx` is the one just answered — then from the
     start; all answered, the first one, to look back through. */
  let from = 0;
  for (let i = rec.idx ?? 0; i < (rec.items ?? []).length; i++) if (at.has(i)) { from = at.get(i); break; }
  const open = i => sels[i] === undefined;
  let idx = queue.findIndex((_, i) => i >= from && open(i));
  if (idx === -1) idx = queue.findIndex((_, i) => open(i));
  if (idx === -1) idx = 0;
  return { queue, sels, idx };
}

/* Newest first, one per id, at most `max`. */
export function mergeSessions(list, rec, max = 50) {
  const rest = (list ?? []).filter(s => s.id !== rec.id);
  return [rec, ...rest].sort((a, b) => (b.updated_at > a.updated_at ? 1 : b.updated_at < a.updated_at ? -1 : 0)).slice(0, max);
}

/* "Just now", "3 hours ago", "Yesterday", "4 days ago", "12 Oct". */
export function ago(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) { const m = Math.floor(s / 60); return `${m} minute${m === 1 ? "" : "s"} ago`; }
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h === 1 ? "" : "s"} ago`; }
  const d = Math.floor(s / 86400);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
