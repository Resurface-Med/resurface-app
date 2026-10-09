import { useMemo, useState } from "react";
import { V, h1 } from "../ui/theme";
import { QUESTIONS } from "../data";
import Wave from "../ui/Wave";
import { confirm } from "../ui/Confirm";
import { seenCount, buildTree, leavesUnder, pctOf } from "../lib/progress";

/**
 * Progress — coverage and accuracy over your decks, as deep as you made them.
 *
 * It used to read three fixed fields off every question: block, subject,
 * topic. Those were the bank's shape, which was always exactly three levels,
 * and they are manufactured from the deck path — root, the one below it, the
 * last one. Your decks are whatever depth you made them, so the three were
 * only ever right at exactly three:
 *
 *     Renal                            Renal / Renal / Renal
 *     Renal > Week 1                   Renal / Week 1 / Week 1
 *     Renal > Week 1 > Upper Tract     correct
 *     Year 2 > Renal > Week 1 > Upper  Week 1 silently dropped
 *
 * One level repeated the same name three times, two duplicated it, four lost
 * a level in the middle — and Generate pushes people straight into the first
 * of those, since a new deck with no parent is one level. So this walks the
 * decks themselves now. Depth stops being something you can get wrong,
 * because nothing is being flattened into a shape it does not have.
 *
 * The band says where you stand in a sentence: the numbers are on the sheet,
 * and a sentence says what they mean. Accuracy appears only once there is
 * enough of it to mean anything, and never in red — two wrong out of two is
 * not a failing subject, it is Tuesday.
 */

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

/* Enough attempts to be worth reporting a percentage from. Shallower rows
   cover more questions, so they need more behind them before the number
   stops being noise. */
const MIN_ATTEMPTS = [10, 10, 5];
function minFor(depth) { return MIN_ATTEMPTS[Math.min(depth, MIN_ATTEMPTS.length - 1)]; }

/** "Immunology, Histology and Anatomy" — or "and 4 others" past three. */
function listNames(names) {
  if (names.length <= 3) {
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
}

/**
 * The band's sentence. How much you have seen, which deck is going best,
 * which have not been opened. Deadpan; no praise, no alarm.
 */
function summarise(roots, pStats) {
  const seen = seenCount(QUESTIONS, pStats);
  const total = QUESTIONS.length;
  /* Nothing at all: the band says nothing and the empty state below says it
     once. Saying it in both is how a header and an empty state end up
     repeating each other. */
  if (total === 0) return null;
  if (seen === 0) return { lead: "Nothing attempted yet.", rest: "Answer a few questions and this fills in." };

  const rated = roots.filter(r => r.attempts >= minFor(0)).sort((a, b) => pctOf(b) - pctOf(a));
  const untouched = roots.filter(r => r.seen === 0).map(r => r.name);

  const rest = [];
  if (rated.length >= 2 && pctOf(rated[0]) - pctOf(rated[rated.length - 1]) >= 15) {
    rest.push(`${rated[0].name} is going best; ${rated[rated.length - 1].name} least.`);
  } else if (rated.length >= 1) {
    rest.push(`${rated[0].name} is going best.`);
  }
  if (untouched.length > 0 && untouched.length < roots.length) {
    rest.push(`${listNames(untouched)} ${untouched.length === 1 ? "is" : "are"} untouched.`);
  }
  return { lead: `You’ve seen ${seen} of ${total}.`, rest: rest.join(" ") };
}

/* Coverage as a length, with accuracy inside it: of the part you have seen,
   the correct share is solid and the rest faded. No label — the two tones are
   the reading. */
function Bar({ node, depth }) {
  const cover = node.total ? Math.max(0, Math.min(1, node.seen / node.total)) : 0;
  const pct = pctOf(node);
  const rated = node.attempts >= minFor(depth) && pct !== null;
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

function Figure({ node, depth, withPct = false }) {
  const pct = pctOf(node);
  const rated = withPct && node.attempts >= minFor(depth) && pct !== null;
  return (
    <span className="prog-fig-seen">
      {node.seen} of {node.total}
      {rated && <span className="prog-fig-pct"> · {pct}% correct</span>}
    </span>
  );
}

/**
 * One deck and everything under it, at any depth.
 *
 * A deck with children opens to show them; one without is a way straight into
 * practising it. The old version had a row type per level — subject, then
 * topic — which is why it could only describe three.
 */
function Node({ node, depth, open, onToggle, onPractice }) {
  const hasKids = node.children.length > 0;
  const isOpen = open.has(node.id);

  if (!hasKids) {
    return (
      <li className={`prog-topic${node.seen === 0 ? " is-untouched" : ""}`}>
        <button type="button" className="prog-topic-row" onClick={() => onPractice(node)}>
          <span className="prog-topic-line">
            <span className="prog-topic-name">{node.name}</span>
            <Figure node={node} depth={depth} />
            <span className="prog-topic-go" aria-hidden="true">→</span>
          </span>
          <Bar node={node} depth={depth} />
        </button>
      </li>
    );
  }

  return (
    <li className={`prog-subject${isOpen ? " is-open" : ""}${node.seen === 0 ? " is-untouched" : ""}`}>
      <button type="button" className="prog-subject-row" onClick={() => onToggle(node.id)} aria-expanded={isOpen}>
        <span className="prog-subject-line">
          <span className="prog-subject-name">{node.name}</span>
          <Figure node={node} depth={depth} withPct={isOpen} />
        </span>
        {isOpen && <Bar node={node} depth={depth} />}
      </button>

      {isOpen && (
        <>
          <ul className="prog-topics">
            {node.children.map(c => (
              <Node key={c.id} node={c} depth={depth + 1} open={open} onToggle={onToggle} onPractice={onPractice} />
            ))}
          </ul>
          <button type="button" className="prog-practice-all" onClick={() => onPractice(node)}>
            Practice all of {node.name} <span aria-hidden="true">→</span>
          </button>
        </>
      )}
    </li>
  );
}

/**
 * What the page says when there is nothing to measure.
 *
 * A title, a line, a button. Somebody who has just signed up does not need
 * the feature described, they need the one action that makes it work.
 */
function Blank({ onGenerate }) {
  return (
    <div className="prog-blank">
      <div className="prog-blank-inner">
        <h2 className="prog-blank-title">No progress yet</h2>
        <p className="prog-blank-body">
          Add a lecture and your progress will show up here.
        </p>
        <button type="button" className="prog-blank-cta btn-press" onClick={onGenerate}>
          Add material
        </button>
      </div>
    </div>
  );
}

export default function StatsView({
  pStats, decks = [], setView, setLaunchFilter, setStudyScope, onClearP, onClearSR,
}) {
  const [open, setOpen] = useState(() => new Set());

  const roots = useMemo(
    () => buildTree(QUESTIONS, decks, pStats),
    [decks, pStats],
  );

  /* By leaf id, not by name. Study filters on leaves — the deck ids with
     nothing under them — and that is the only identifier here that cannot be
     ambiguous: two decks may share a name, and the block/subject/topic labels
     this page used to read were manufactured and wrong at most depths. */
  function practice(node) {
    setStudyScope?.("all");
    setLaunchFilter({ leaves: leavesUnder(node) });
    setView(V.STUDY);
  }

  function toggle(id) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const summary = useMemo(() => summarise(roots, pStats), [roots, pStats]);
  /* Against the questions that exist, not the rows that are stored — progress
     outlives the question it was recorded against. */
  const attempted = useMemo(() => seenCount(QUESTIONS, pStats) > 0, [pStats]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Progress</h1>
        {summary && (
          <p className="prog-lead" data-in="left" style={{ "--i": 1 }}>
            <span className="prog-lead-first">{summary.lead}</span>
            {summary.rest ? <> {summary.rest}</> : null}
          </p>
        )}
      </div>

      <Wave from="transparent" to="var(--c-surface2)" />

      <div style={{ background: "var(--c-surface2)", flex: 1, display: "flex", flexDirection: "column" }}>
        {roots.length === 0 ? <Blank onGenerate={() => setView(V.GENERATE)} /> : (
          <div className="prog-sheet" style={{ ...band, maxWidth: 760 }}>
            {/* One card per deck at the top of your tree, whatever you have
                called them. There is no fixed level here any more. */}
            {roots.map((r, i) => (
              <section key={r.id} className="prog-card anim-scale-in" style={{ "--i": i }}>
                <div className="prog-card-head">
                  <h2 className="prog-card-title">{r.name}</h2>
                  <span className="prog-card-fig">{r.seen} of {r.total}</span>
                </div>
                {r.children.length > 0 ? (
                  <ul className="prog-subjects">
                    {r.children.map(c => (
                      <Node key={c.id} node={c} depth={1} open={open} onToggle={toggle} onPractice={practice} />
                    ))}
                  </ul>
                ) : (
                  /* A deck at the top of the tree with nothing under it is the
                     commonest shape of all — one lecture, filed on its own —
                     and used to render as a card with an empty body. */
                  <ul className="prog-subjects">
                    <Node node={r} depth={1} open={open} onToggle={toggle} onPractice={practice} />
                  </ul>
                )}
              </section>
            ))}

            {/* Only once there is something to undo. Two destructive buttons
                are not an introduction to a page. */}
            {attempted && (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
