import { useMemo, useState } from "react";
import { C } from "./theme";
import { QUESTIONS, BLOCKS } from "../data";

/**
 * Choosing what to practise, by topic. Several at once.
 *
 * Subjects are the first scan; topics open under the one you care about. That
 * keeps the default view short (nine rows with air) without a second screen,
 * and without dumping forty topics into one scroll.
 *
 * Counts and coverage sit on every row because that is knowledge in the
 * world. Empty rows are disabled — a constraint, not an error after the fact.
 *
 * Selection is held entirely in `cat`, with `deck` left as ["All"]. Two facts
 * make that the right shape. filteredQuestions already ANDs deck against cat,
 * so a mixed selection — all of Biochemistry plus one Anatomy topic — would
 * filter to the intersection and quietly drop most of what was picked. And no
 * topic name appears under more than one subject (41 of them, zero
 * collisions), so naming the topics alone is unambiguous. Picking a subject
 * therefore means picking every topic under it, which composes with everything
 * else the same way.
 */

/**
 * block → subject → topic, counted.
 *
 * Blocks are the outer level because that is how the course runs: Principles,
 * then Respiratory, then Cardiovascular, each containing the same subjects
 * again. They are rendered as headings rather than as a third thing to expand
 * — three levels of disclosure to reach a topic is two taps too many, and a
 * heading gives the same grouping for free.
 */
function buildTree(pStats, eligible) {
  const blocks = new Map();

  for (const q of QUESTIONS) {
    const bName = q.block || "Other";
    let b = blocks.get(bName);
    if (!b) { b = { block: bName, total: 0, avail: 0, decks: new Map() }; blocks.set(bName, b); }

    let d = b.decks.get(q.deck);
    if (!d) { d = { deck: q.deck, total: 0, seen: 0, avail: 0, cats: new Map() }; b.decks.set(q.deck, d); }

    let c = d.cats.get(q.cat);
    if (!c) { c = { cat: q.cat, total: 0, seen: 0, avail: 0 }; d.cats.set(q.cat, c); }

    const isSeen = Boolean(pStats[q.id]);
    const isAvail = eligible.has(q.id);

    b.total += 1; d.total += 1; c.total += 1;
    if (isSeen)  { d.seen  += 1; c.seen  += 1; }
    if (isAvail) { b.avail += 1; d.avail += 1; c.avail += 1; }
  }

  const order = BLOCKS.length ? BLOCKS : [...blocks.keys()];
  return order
    .filter(name => blocks.has(name))
    .map(name => {
      const b = blocks.get(name);
      return {
        ...b,
        decks: [...b.decks.values()]
          .sort((x, y) => y.total - x.total)
          .map(d => ({ ...d, cats: [...d.cats.values()].sort((x, y) => y.total - x.total) })),
      };
    });
}

function shortCat(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

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
      width="16" height="16" viewBox="0 0 18 18"
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

/** on | off | mixed — a subject whose topics are only partly chosen. */
function Check({ state }) {
  return (
    <span
      className={`topic-check${state === true ? " is-on" : state === "mixed" ? " is-mixed" : ""}`}
      aria-hidden="true"
    >
      {state === true && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6.4L4.6 9 10 3.2"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {state === "mixed" && <span className="topic-check-dash" />}
    </span>
  );
}

export default function TopicPicker({ value, onChange, pStats, eligibleIds, query = "" }) {
  /* Chosen topics as a set, or null meaning "everything". null rather than a
     set of all 41 so that adding a deck to the bank does not silently leave
     an old selection behind. */
  const selected = useMemo(() => {
    const cats = value.cat ?? ["All"];
    return cats.includes("All") || cats.length === 0 ? null : new Set(cats);
  }, [value.cat]);

  const eligible = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const full = useMemo(() => buildTree(pStats, eligible), [pStats, eligible]);
  const totalAvail = eligible.size;

  /* Open the subject holding the first chosen topic, so arriving from
     Progress with one topic already picked shows it rather than hiding it
     inside a collapsed row. */
  const [open, setOpen] = useState(() => {
    const first = (value.cat ?? []).find(c => c && c !== "All");
    if (!first) return new Set();
    const owner = full
      .flatMap(b => b.decks)
      .find(d => d.cats.some(c => c.cat === first));
    return new Set(owner ? [owner.deck] : []);
  });

  const q = query.trim().toLowerCase();
  /* Search filters inside blocks and then drops any block left with nothing,
     so a query never leaves a heading standing over an empty space. */
  const tree = useMemo(() => {
    if (!q) return full;
    return full
      .map(b => ({
        ...b,
        decks: b.decks.flatMap(d => {
          if (d.deck.toLowerCase().includes(q)) return [d];
          const cats = d.cats.filter(c => c.cat.toLowerCase().includes(q));
          return cats.length ? [{ ...d, cats }] : [];
        }),
      }))
      .filter(b => b.decks.length > 0);
  }, [full, q]);

  /* Shown even when there is only one. A heading naming the single thing on
     screen adds no information, which is the usual reason to hide it — but
     here it is teaching the shape of the course, so that the day Respiratory
     appears underneath Principles it reads as the list continuing rather than
     as the screen changing. */

  /* Blocks open one at a time by default rather than all at once. Nine
     subjects a block across four blocks is thirty-six rows before a single
     topic is shown, which is the reason these are rows and not headings. */
  const [openBlocks, setOpenBlocks] = useState(() => {
    const first = (value.cat ?? []).find(c => c && c !== "All");
    const owner = first && full.find(b => b.decks.some(d => d.cats.some(c => c.cat === first)));
    return new Set([owner?.block ?? full[0]?.block].filter(Boolean));
  });

  function toggleBlock(name) {
    setOpenBlocks(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  /** A block is its topics, the same way a subject is. */
  function toggleBlockPick(b) {
    const cats = b.decks.flatMap(d => d.cats.filter(c => c.avail > 0).map(c => c.cat));
    if (!cats.length) return;
    const next = new Set(selected ?? []);
    const allOn = cats.every(c => next.has(c));
    cats.forEach(c => (allOn ? next.delete(c) : next.add(c)));
    emit(next);
  }

  function blockState(b) {
    if (!selected) return false;
    const cats = b.decks.flatMap(d => d.cats.map(c => c.cat));
    const on = cats.filter(c => selected.has(c)).length;
    if (on === 0) return false;
    return on === cats.length ? true : "mixed";
  }

  const isAll = selected === null;

  /* Empty set means nothing is chosen, which is not a state worth having on a
     screen whose next button starts a session — it collapses back to All. */
  function emit(next) {
    if (!next || next.size === 0) onChange({ deck: ["All"], cat: ["All"] });
    else onChange({ deck: ["All"], cat: [...next] });
  }

  function pickAll() { onChange({ deck: ["All"], cat: ["All"] }); }

  function toggleCat(cat) {
    const next = new Set(selected ?? []);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    emit(next);
  }

  /** A subject is its topics, so toggling it toggles all of them together. */
  function toggleDeck(d) {
    const cats = d.cats.filter(c => c.avail > 0).map(c => c.cat);
    if (cats.length === 0) return;
    const next = new Set(selected ?? []);
    const allOn = cats.every(c => next.has(c));
    cats.forEach(c => (allOn ? next.delete(c) : next.add(c)));
    emit(next);
  }

  const catState = cat => (selected ? selected.has(cat) : false);
  function deckState(d) {
    if (!selected) return false;
    const cats = d.cats.map(c => c.cat);
    const on = cats.filter(c => selected.has(c)).length;
    if (on === 0) return false;
    return on === cats.length ? true : "mixed";
  }

  function toggle(d) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  return (
    <div role="group" aria-label="Topics">
      {!q && (
        <button
          type="button"
          role="checkbox"
          aria-checked={isAll}
          onClick={pickAll}
          className={`topic-row topic-row-roomy${isAll ? " is-active" : ""}`}
        >
          <Check state={isAll} />
          <span className="topic-name" style={{ fontWeight: 600 }}>All blocks</span>
          <span className="topic-meta">
            <span className="topic-avail">{totalAvail}</span>
          </span>
        </button>
      )}

      {q && tree.length === 0 && (
        <p style={{ padding: "20px 4px", fontSize: 14.5, color: C.muted }}>
          No topic matches “{query.trim()}”.
        </p>
      )}

      {tree.map(b => {
        const bOpen = q ? true : openBlocks.has(b.block);
        const bState = blockState(b);
        const bEmpty = b.avail === 0;
        return (
        <div key={b.block} className="topic-block">
          <div className={`topic-row topic-row-roomy is-block${bState === true ? " is-active" : ""}${bEmpty ? " is-empty" : ""}`}>
            <button
              type="button"
              role="checkbox"
              aria-checked={bState === "mixed" ? "mixed" : bState}
              disabled={bEmpty}
              onClick={() => toggleBlockPick(b)}
              className="topic-hit"
            >
              <Check state={bState} />
              <span className="topic-name is-block">{b.block}</span>
              <span className="topic-meta">
                <span className="topic-avail">{b.avail}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => toggleBlock(b.block)}
              aria-expanded={bOpen}
              aria-label={`${bOpen ? "Hide" : "Show"} ${b.block} subjects`}
              className={`topic-expand${bOpen ? " is-open" : ""}`}
            >
              <Chevron open={bOpen} />
            </button>
          </div>

      {bOpen && b.decks.map(d => {
        const empty = d.avail === 0;
        const isOpen = q ? true : open.has(d.deck);
        const many = d.cats.length > 1;
        const dState = deckState(d);

        return (
          <div key={d.deck} className="topic-group">
            <div className={`topic-row topic-row-roomy${dState === true ? " is-active" : ""}${empty ? " is-empty" : ""}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={dState === "mixed" ? "mixed" : dState}
                disabled={empty}
                onClick={() => toggleDeck(d)}
                className="topic-hit"
              >
                <Check state={dState} />
                <span className="topic-name">{d.deck}</span>
                <Coverage seen={d.seen} total={d.total} avail={d.avail} dim={empty} />
              </button>

              {many && (
                <button
                  type="button"
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
              const on = catState(c.cat);
              return (
                <button
                  key={c.cat}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={catEmpty}
                  onClick={() => toggleCat(c.cat)}
                  className={`topic-row is-child${on ? " is-active" : ""}${catEmpty ? " is-empty" : ""}`}
                >
                  <Check state={on} />
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
      })}
    </div>
  );
}
