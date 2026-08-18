import { useMemo, useState } from "react";
import { C } from "./theme";
import { QUESTIONS } from "../data";

/**
 * Choosing what to practise, by topic.
 *
 * Topic is how people actually pick a session, so it is the screen rather than
 * a filter hidden behind a disclosure. Burying the most frequent intent behind
 * the most work is a gulf-of-execution problem: the user knows exactly what
 * they want and the interface makes them hunt for the control.
 *
 * The list is the bank's own structure — nine subjects, each opening onto its
 * categories — so the mapping between what you see and what you get needs no
 * learning. Counts and coverage sit on every row because that is knowledge in
 * the world: you should not have to remember how much Immunology you have done
 * in order to decide whether to do more.
 *
 * Rows that would yield nothing under the current scope are disabled rather
 * than allowed and then explained, which is a constraint preventing the error
 * instead of feedback reporting it.
 */

/** One row per subject, each carrying its categories. */
function buildTree(pStats, eligible) {
  const decks = new Map();

  for (const q of QUESTIONS) {
    let d = decks.get(q.deck);
    if (!d) { d = { deck: q.deck, total: 0, seen: 0, avail: 0, cats: new Map() }; decks.set(q.deck, d); }

    let c = d.cats.get(q.cat);
    if (!c) { c = { cat: q.cat, total: 0, seen: 0, avail: 0 }; d.cats.set(q.cat, c); }

    const isSeen = Boolean(pStats[q.id]);
    const isAvail = eligible.has(q.id);

    d.total += 1; c.total += 1;
    if (isSeen)  { d.seen  += 1; c.seen  += 1; }
    if (isAvail) { d.avail += 1; c.avail += 1; }
  }

  return [...decks.values()]
    .sort((a, b) => b.total - a.total)
    .map(d => ({ ...d, cats: [...d.cats.values()].sort((a, b) => b.total - a.total) }));
}

/** Categories are often prefixed with their own subject; the row above says it. */
function shortCat(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

/** Coverage bar + available count. Track colour is independent of the row
 *  hover wash so the bar stays visible when you mouse over a subject. */
function Coverage({ seen, total, avail, dim }) {
  const pct = total > 0 ? Math.min(100, Math.round((seen / total) * 100)) : 0;
  return (
    <span className="topic-meta" style={{ opacity: dim ? 0.45 : 1 }}>
      <span
        className="topic-bar"
        role="img"
        aria-label={`${seen} of ${total} seen`}
      >
        <span className="topic-bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="topic-avail">{avail}</span>
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg
      className="topic-chevron-icon"
      width="18" height="18" viewBox="0 0 18 18"
      aria-hidden="true"
      style={{
        display: "block",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <path
        d="M6.5 3.5L12 9l-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TopicPicker({ value, onChange, pStats, eligibleIds, query = "" }) {
  const [open, setOpen] = useState(
    () => new Set(value.deck?.[0] && value.deck[0] !== "All" ? [value.deck[0]] : []),
  );

  const eligible = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const full = useMemo(() => buildTree(pStats, eligible), [pStats, eligible]);
  const totalAvail = eligible.size;

  // Searching keeps a subject when it matches, or when any of its categories
  // does — and then shows only the matching ones. Past about ten rows a list
  // is faster to type into than to read, and this one grows with every year
  // that gets added.
  const q = query.trim().toLowerCase();
  const tree = useMemo(() => {
    if (!q) return full;
    return full.flatMap(d => {
      if (d.deck.toLowerCase().includes(q)) return [d];
      const cats = d.cats.filter(c => c.cat.toLowerCase().includes(q));
      return cats.length ? [{ ...d, cats }] : [];
    });
  }, [full, q]);

  const selDeck = value.deck?.[0] ?? "All";
  const selCat  = value.cat?.[0] ?? "All";

  const isAll      = selDeck === "All";
  const deckActive = d => selDeck === d && selCat === "All";
  const catActive  = (d, c) => selDeck === d && selCat === c;

  function pickAll()          { onChange({ deck: ["All"], cat: ["All"] }); }
  function pickDeck(d)        { onChange({ deck: [d], cat: ["All"] }); }
  function pickCat(d, c)      { onChange({ deck: [d], cat: [c] }); }

  function toggle(d) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  return (
    <div role="radiogroup" aria-label="Topic">
      {!q && (
      <button
        role="radio" aria-checked={isAll}
        onClick={pickAll}
        className={`topic-row${isAll ? " is-active" : ""}`}
      >
        <span className="topic-name" style={{ fontWeight: 600 }}>
          All subjects
        </span>
        <span className="topic-meta">
          <span className="topic-avail">{totalAvail}</span>
        </span>
      </button>
      )}

      {q && tree.length === 0 && (
        <p style={{ padding: "14px 12px", fontSize: 14, color: C.muted }}>
          No topic matches “{query.trim()}”.
        </p>
      )}

      {tree.map(d => {
        const empty = d.avail === 0;
        const isOpen = q ? true : open.has(d.deck);
        const many = d.cats.length > 1;

        return (
          <div key={d.deck}>
            <div className={`topic-row${deckActive(d.deck) ? " is-active" : ""}${empty ? " is-empty" : ""}`}>
              <button
                role="radio" aria-checked={deckActive(d.deck)}
                disabled={empty}
                onClick={() => pickDeck(d.deck)}
                className="topic-hit"
              >
                <span className="topic-name">{d.deck}</span>
                <Coverage seen={d.seen} total={d.total} avail={d.avail} dim={empty} />
              </button>

              {many && (
                <button
                  onClick={() => toggle(d.deck)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Hide" : "Show"} ${d.deck} topics`}
                  className={`topic-expand${isOpen ? " is-open" : ""}`}
                >
                  <Chevron open={isOpen} />
                </button>
              )}
            </div>

            {isOpen && d.cats.map(c => {
              const catEmpty = c.avail === 0;
              return (
                <button
                  key={c.cat}
                  role="radio" aria-checked={catActive(d.deck, c.cat)}
                  disabled={catEmpty}
                  onClick={() => pickCat(d.deck, c.cat)}
                  className={`topic-row is-child${catActive(d.deck, c.cat) ? " is-active" : ""}${catEmpty ? " is-empty" : ""}`}
                >
                  <span className="topic-name is-child">{shortCat(c.cat, d.deck)}</span>
                  <Coverage seen={c.seen} total={c.total} avail={c.avail} dim={catEmpty} />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
