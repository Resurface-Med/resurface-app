/**
 * What a practice session was on, named from the decks its questions sit
 * in: "Year 2 › Renal", "Year 2 · 3 decks", "4 decks". Used by Study's
 * "Continue this session?" banner.
 */
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
