import { useMemo, useState } from "react";
import { V, h1 } from "../ui/theme";
import { QUESTIONS, CURRICULUM } from "../data";
import Wave from "../ui/Wave";
import { confirm } from "../ui/Confirm";

/**
 * Progress — coverage and accuracy by subject, then drill into topics.
 *
 * The band says where you stand in a sentence, computed from the data,
 * rather than as numerals: the numbers are on the sheet, and a sentence
 * says what they mean. The sheet is one card per block, the practice
 * card's surface, with a row per subject; a subject opens its topics
 * inside the card, weakest first, each with Practice as a text link.
 *
 * Accuracy is shown only once there is enough to mean something — ten
 * attempts for a subject, five for a topic — and never in red. Two wrong
 * out of two is not a failing subject; it is Tuesday.
 */

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

const SUBJECT_MIN_ATTEMPTS = 10;
const TOPIC_MIN_ATTEMPTS = 5;

function shortCat(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

function tally(qs, pStats) {
  let correct = 0, attempts = 0, seen = 0;
  for (const q of qs) {
    const s = pStats[q.id];
    if (s) { correct += s.correct; attempts += s.total; seen++; }
  }
  const pct = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
  return { total: qs.length, seen, attempts, pct };
}

function topicStats(cat, pStats) {
  return tally(QUESTIONS.filter(q => q.cat === cat), pStats);
}

function deckStats(deck, pStats) {
  return tally(QUESTIONS.filter(q => q.deck === deck), pStats);
}

/** "Immunology, Histology and Anatomy" — or "and 4 others" past three. */
function listNames(names) {
  if (names.length <= 3) {
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/**
 * The band's sentence. Says the one or two things worth saying: how much
 * of the bank you have seen, which subject is going best, which have not
 * been opened. Deadpan; no praise, no alarm.
 */
function summarise(pStats) {
  const seen = Object.keys(pStats).length;
  const total = QUESTIONS.length;
  if (seen === 0) return { lead: "Nothing attempted yet.", rest: "Answer a few questions and this fills in." };

  const decks = [...new Set(QUESTIONS.map(q => q.deck))];
  const stats = decks.map(deck => ({ deck, ...deckStats(deck, pStats) }));
  const rated = stats.filter(s => s.attempts >= SUBJECT_MIN_ATTEMPTS).sort((a, b) => b.pct - a.pct);
  const untouched = stats.filter(s => s.seen === 0).map(s => s.deck);

  const rest = [];
  if (rated.length >= 2 && rated[0].pct - rated[rated.length - 1].pct >= 15) {
    rest.push(`${rated[0].deck} is going best; ${rated[rated.length - 1].deck} least.`);
  } else if (rated.length >= 1) {
    rest.push(`${rated[0].deck} is going best.`);
  }
  if (untouched.length > 0 && untouched.length < decks.length) {
    rest.push(`${listNames(untouched)} ${untouched.length === 1 ? "is" : "are"} untouched.`);
  }
  return { lead: `You’ve seen ${seen} of ${total}.`, rest: rest.join(" ") };
}

/* Coverage as a length, with accuracy inside it: of the part you have
   seen, the correct share is solid and the rest faded. No label — the two
   tones are the reading. */
function Bar({ seen, total, attempts, pct, min }) {
  const cover = total ? Math.max(0, Math.min(1, seen / total)) : 0;
  const rated = attempts >= min && pct !== null;
  const right = rated ? cover * (pct / 100) : 0;
  return (
    <span
      className="prog-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(cover * 100)}
      aria-label={rated ? `${Math.round(cover * 100)}% seen, ${pct}% correct` : `${Math.round(cover * 100)}% seen`}
    >
      <span className="prog-bar-seen" style={{ transform: `scaleX(${cover})` }} />
      <span className="prog-bar-right" style={{ transform: `scaleX(${right})` }} />
    </span>
  );
}

/* The figure: how much is seen, and — on the open subject only, once
   there is enough behind it — how much of that was correct. */
function Figure({ seen, total, attempts, pct, min, withPct = false }) {
  const rated = withPct && attempts >= min && pct !== null;
  return (
    <span className="prog-fig-seen">
      {seen} of {total}
      {rated && <span className="prog-fig-pct"> · {pct}% correct</span>}
    </span>
  );
}

function SubjectRow({ deck, cats, pStats, open, onToggle, onPractice }) {
  const d = deckStats(deck, pStats);
  const sorted = useMemo(() => {
    return [...cats].sort((a, b) => {
      const pa = topicStats(a, pStats).pct;
      const pb = topicStats(b, pStats).pct;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb;
    });
  }, [cats, pStats]);

  return (
    <li className={`prog-subject${open ? " is-open" : ""}${d.seen === 0 ? " is-untouched" : ""}`}>
      <button type="button" className="prog-subject-row" onClick={onToggle} aria-expanded={open}>
        <span className="prog-subject-line">
          <span className="prog-subject-name">{deck}</span>
          <Figure {...d} min={SUBJECT_MIN_ATTEMPTS} withPct={open} />
        </span>
        {open && <Bar {...d} min={SUBJECT_MIN_ATTEMPTS} />}
      </button>

      {open && (
        <>
          {/* Each topic row is the way into practising it — one verb for
              the whole list rather than one per line. */}
          <ul className="prog-topics">
            {sorted.map(cat => {
              const t = topicStats(cat, pStats);
              return (
                <li key={cat} className={`prog-topic${t.seen === 0 ? " is-untouched" : ""}`}>
                  <button type="button" className="prog-topic-row" onClick={() => onPractice(deck, cat)}>
                    <span className="prog-topic-line">
                      <span className="prog-topic-name">{shortCat(cat, deck)}</span>
                      <Figure {...t} />
                      <span className="prog-topic-go" aria-hidden="true">→</span>
                    </span>
                    <Bar {...t} min={TOPIC_MIN_ATTEMPTS} />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="prog-practice-all" onClick={() => onPractice(deck, null)}>
            Practice all of {deck} <span aria-hidden="true">→</span>
          </button>
        </>
      )}
    </li>
  );
}

export default function StatsView({
  pStats, setView, setLaunchFilter, setStudyScope, onClearP, onClearSR,
}) {
  const [openDecks, setOpenDecks] = useState(() => new Set());

  function practice(deck, cat) {
    setStudyScope?.("all");
    setLaunchFilter(cat ? { deck, cat } : { deck });
    setView(V.STUDY);
  }

  function toggleDeck(key) {
    setOpenDecks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const summary = useMemo(() => summarise(pStats), [pStats]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Progress</h1>
        <p className="prog-lead" data-in="left" style={{ "--i": 1 }}>
          <span className="prog-lead-first">{summary.lead}</span>
          {summary.rest ? <> {summary.rest}</> : null}
        </p>
      </div>

      <Wave from="transparent" to="var(--c-surface2)" />

      <div style={{ background: "var(--c-surface2)", flex: 1 }}>
        <div className="prog-sheet" style={{ ...band, maxWidth: 760 }}>
          {CURRICULUM.map((b, i) => {
            const blockQs = QUESTIONS.filter(q => q.block === b.block);
            const bt = tally(blockQs, pStats);
            return (
            <section key={b.block} className="prog-card anim-scale-in" style={{ "--i": i }}>
              <div className="prog-card-head">
                <h2 className="prog-card-title">{b.block}</h2>
                <span className="prog-card-fig">{bt.seen} of {bt.total}</span>
              </div>
              <ul className="prog-subjects">
                {b.decks.map(d => {
                  const key = `${b.block}/${d.deck}`;
                  return (
                    <SubjectRow
                      key={key}
                      deck={d.deck}
                      cats={d.cats}
                      pStats={pStats}
                      open={openDecks.has(key)}
                      onToggle={() => toggleDeck(key)}
                      onPractice={practice}
                    />
                  );
                })}
              </ul>
            </section>
            );
          })}

          <div className="prog-reset">
            <button
              type="button"
              className="prog-reset-btn"
              onClick={async () => { if (await confirm({ title: "Reset practice stats?", body: "Every question goes back to unseen. This can’t be undone.", action: "Reset", danger: true })) onClearP?.(); }}
            >
              Reset practice stats
            </button>
            <button
              type="button"
              className="prog-reset-btn"
              onClick={async () => { if (await confirm({ title: "Reset review schedules?", body: "Nothing will be due until you answer again. This can’t be undone.", action: "Reset", danger: true })) onClearSR?.(); }}
            >
              Reset review schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
