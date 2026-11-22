/**
 * The ready-made bundle from its pieces (2026-11-22, migration 0099).
 *
 * The server keeps one shard per listed root, each with a hash of its
 * content; featured_mine lists them in order. The app keeps each shard on
 * the device and fetches only those whose hash it does not have, so an
 * edit to one deck costs that deck's shard rather than all 14 MB.
 *
 * Pure: puts shards together exactly as featured_bundle_compose does on
 * the server — roots, decks, topics and questions in the parts' order, each
 * question's topic index moved on by the topics of the shards before it.
 */
export function composeParts(version, bodies) {
  const roots = [], decks = [], topics = [], questions = [];
  for (const body of bodies) {
    const off = topics.length;
    if (body?.root) roots.push(body.root);
    for (const d of body?.decks ?? []) decks.push(d);
    for (const t of body?.topics ?? []) topics.push(t);
    for (const q of body?.questions ?? []) questions.push(q.t == null || off === 0 ? q : { ...q, t: q.t + off });
  }
  return { version, roots, decks, topics, questions };
}

/** Stands for this exact set of shards: the bundle in memory is reused
    only while it matches. */
export function partsKey(parts) {
  return (parts ?? []).map(p => `${p.root}:${p.hash}`).join(",");
}

/** Usable parts: a non-empty list, each with a root and a hash. */
export function validParts(parts) {
  return Array.isArray(parts) && parts.length > 0 && parts.every(p => p && typeof p.root === "string" && typeof p.hash === "string");
}
