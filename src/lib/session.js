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
