/**
 * What a session does with a question you got wrong.
 *
 * The scheduler already intended this: a lapse is given a one-minute step,
 * which is Anki's learning step and exists to bring the card round again in
 * the same sitting. The session could not honour it, because the queue was
 * built once and only ever walked forwards — so "one minute" quietly meant
 * "next time you practise", days later, and the most useful moment in recall
 * was thrown away. Meeting the thing you just missed, while you still
 * remember missing it, is most of what practice is for.
 *
 * Kept out of the component so it can be tested, because the index
 * arithmetic is the part that will break quietly: a session keys its answers
 * by queue position, so putting something back in the wrong place silently
 * reattributes somebody's answers to other questions.
 */

/** Far enough not to be recognition, near enough to be the same sitting. */
export const REASK_GAP = 4;

/**
 * Puts a missed question back, `gap` places further on.
 *
 * Only ever ahead of where you are. A session moves forwards, so every slot
 * past the current one is empty and shifting them disturbs nothing; inserting
 * at or behind the current position would renumber answers that already
 * exist. Past the end of the queue it simply goes last.
 */
export function reask(queue, idx, question, gap = REASK_GAP) {
  const at = Math.min(idx + gap, queue.length);
  const next = queue.slice();
  next.splice(Math.max(at, idx + 1), 0, question);
  return next;
}

/**
 * Moves every answer at position `at` or later one place on, to follow a
 * question inserted at `at`.
 *
 * reask's own promise — never behind where you are — was not enough: the
 * question list lets you jump ahead, answer, and come back, so there can be
 * answers past the insertion point. Without this they stayed on their old
 * positions and each was credited to the question before it.
 */
export function shiftFrom(map, at) {
  const out = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    const i = Number(k);
    out[i >= at ? i + 1 : i] = v;
  }
  return out;
}

/** Where reask will put the question, so answers can be moved to match. */
export function reaskAt(queue, idx, gap = REASK_GAP) {
  return Math.max(Math.min(idx + gap, queue.length), idx + 1);
}

/* The parts of a question that make it the same question. Options are
   compared as a set — a saved session holds them shuffled. */
function sameQuestion(a, b) {
  const key = q => JSON.stringify([q.q, [...(q.opts ?? [])].sort(), q.opts?.[q.ans], q.exp]);
  return key(a) === key(b);
}

/**
 * A saved session, checked against the questions that exist now.
 *
 * A saved session holds copies, and the copies go stale: a question deleted
 * since was still served (and its answer recorded against an id that no
 * longer exists), and one corrected since came back with the mistake in it.
 *
 * What you answered stays as you answered it — that is the record of the
 * session. What you have not answered is refreshed: gone if the question is
 * gone, the current version (reshuffled) if it has changed, untouched if not.
 *
 * Returns { queue, sels, idx }, or null if nothing is left to resume.
 */
export function refreshSaved(saved, liveById, reshuffle) {
  const queue = saved?.queue ?? [];
  const sels = saved?.sels ?? {};
  const out = [];
  const outSels = {};
  const newIndex = [];
  queue.forEach((q, i) => {
    const answered = sels[i] !== undefined;
    const live = liveById.get(q.id);
    newIndex[i] = out.length;
    if (answered) { outSels[out.length] = sels[i]; out.push(q); return; }
    if (!live) return;
    out.push(sameQuestion(q, live) ? q : reshuffle(live));
  });
  if (!out.length) return null;
  const at = Math.min(saved?.idx ?? 0, queue.length - 1);
  const idx = Math.min(newIndex[Math.max(0, at)] ?? 0, out.length - 1);
  return { queue: out, sels: outSels, idx };
}
