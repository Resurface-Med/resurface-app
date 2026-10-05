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
 * How many of the chosen questions have been got right.
 *
 * The count a session shows is questions, not cards. The queue grows as
 * things are put back into it, and a counter reading off its length would
 * climb away from the person using it — telling someone who asked for twenty
 * that they now have twenty-three to do. Getting the same question right
 * twice is still one question.
 */
export function clearedCount(results) {
  const got = new Set();
  for (const r of Object.values(results || {})) if (r && r.correct) got.add(r.id);
  return got.size;
}

/** How many distinct questions a queue holds, however many times each appears. */
export function distinctCount(queue) {
  return queue ? new Set(queue.map(q => q.id)).size : 0;
}
