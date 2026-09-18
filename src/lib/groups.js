/** The share code in the address, if someone arrived by a link. */
export function groupCodeFromLocation() {
  const m = window.location.pathname.match(/^\/g\/([a-f0-9]{12})$/);
  return m ? m[1] : null;
}

export function groupShareUrl(group) {
  return `${window.location.origin}/g/${group.shareCode}`;
}

/** A topic is a (deck, cat) pair; this is its key. */
export function topicKey(t) {
  return `${t.deck}\u001f${t.cat}`;
}

/** The Study filter a group stands for. */
export function groupFilter(group) {
  const cats = group.topics.map(t => t.cat);
  return cats.length
    ? { deck: ["All"], cat: cats }
    : { deck: ["All"], cat: ["All"] };
}
