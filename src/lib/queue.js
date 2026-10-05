/**
 * The shape of the retry queue, kept separate so it can be tested.
 *
 * Every write the app makes is fired and forgotten — the screen has already
 * moved on, and a study session must never wait for a round trip. A write
 * that fails is parked here and tried again when the network comes back, so
 * this is the only thing standing between a student on a bad train and a lost
 * evening's work. It is worth being exact about.
 */

/** Newest writes are the ones worth keeping if an offline session runs long. */
export const QUEUE_MAX = 500;

export function append(queue, op) {
  return [...(queue || []), op].slice(-QUEUE_MAX);
}

/**
 * Removes one instance of an op, leaving everything else as it is.
 *
 * One, not all: the same write can legitimately be queued twice — answering
 * the same question twice offline is two identical ops, and both have to
 * reach the server.
 *
 * By value rather than by reference, because the queue is round-tripped
 * through localStorage between being written and being flushed, so the object
 * that comes back is never the object that went in.
 */
export function dropOnce(queue, op) {
  const list = queue || [];
  const target = JSON.stringify(op);
  const i = list.findIndex(o => JSON.stringify(o) === target);
  if (i === -1) return list;
  return [...list.slice(0, i), ...list.slice(i + 1)];
}
