/**
 * Due questions grouped into topics, for choosing what to review
 * (Rafil, 2026-11-13).
 *
 * The level is whichever one actually splits them: if everything due is in
 * Year 2 by Jacob, the topics are Renal, Respiratory and so on rather than one
 * row reading "Year 2 by Jacob"; if it is all in Respiratory, they are its
 * lectures. Each topic carries the level below it, so a topic can be opened
 * and narrowed further.
 *
 * Pure: questions in ({ id, path: [{ id, name }] }), groups out.
 */

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export function reviewGroups(questions) {
  const qs = questions.filter(q => Array.isArray(q.path) && q.path.length);
  if (!qs.length) return [];

  let d = 0;
  for (;;) {
    const here = new Set(qs.map(q => q.path[d]?.id));
    if (here.size === 1 && qs.every(q => q.path.length > d + 1)) d += 1;
    else break;
  }

  const groups = new Map();
  for (const q of qs) {
    const step = q.path[Math.min(d, q.path.length - 1)];
    let g = groups.get(step.id);
    if (!g) { g = { key: step.id, name: step.name, children: new Map() }; groups.set(step.id, g); }
    /* Questions sitting in the topic's own deck rather than a deck below it
       are a child of their own, under the topic's name. */
    const below = q.path.length > d + 1 ? q.path[d + 1] : { id: "", name: step.name };
    const ck = `${step.id}/${below.id}`;
    let c = g.children.get(ck);
    if (!c) { c = { key: ck, name: below.name, ids: [] }; g.children.set(ck, c); }
    c.ids.push(q.id);
  }

  return [...groups.values()]
    .map(g => {
      const children = [...g.children.values()].sort(byName);
      return { key: g.key, name: g.name, children, count: children.reduce((n, c) => n + c.ids.length, 0) };
    })
    .sort(byName);
}

/** Every child key, which is what "all ticked" means. */
export function allKeys(groups) {
  return groups.flatMap(g => g.children.map(c => c.key));
}

/** The question ids under the ticked children. */
export function idsFor(groups, selected) {
  return groups.flatMap(g => g.children.filter(c => selected.has(c.key)).flatMap(c => c.ids));
}
