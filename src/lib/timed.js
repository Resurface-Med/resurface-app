/*
 * Timed sessions (2026-11-08). One clock for the whole session at a minute a
 * question, the pace of an SBA paper, rather than a timer on each question:
 * students answer in about 10 seconds at the median (answer_log, 13,700
 * answers), so a per-question timer would almost never run out and would
 * only add pressure. Everything else about the session is unchanged.
 */

export const MS_PER_QUESTION = 60_000;

/** The session's allowance for this many questions. */
export function timeLimit(questions) {
  return Math.max(1, questions) * MS_PER_QUESTION;
}

/** "4:05", "12:00", "1:02:30"; never negative. */
export function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The line under the score on the results page. */
export function timedLine({ limitMs, usedMs, ranOut }) {
  if (ranOut) return `Time ran out at ${formatClock(limitMs)}.`;
  return `Finished in ${formatClock(usedMs)} of ${formatClock(limitMs)}.`;
}
