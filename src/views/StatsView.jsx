import { useEffect, useMemo, useState } from "react";
import { V, h1 } from "../ui/theme";
import { QUESTIONS } from "../data";
import Wave from "../ui/Wave";
import { confirm } from "../ui/Confirm";
import StreakFlame from "../ui/StreakFlame";
import { seenCount, buildTree, leavesUnder, pctOf } from "../lib/progress";
import { waitingMistakes } from "../lib/pastSessions";
import { fetchAnswerDays } from "../lib/remote";
import { weekDays, weekLine, weeklyAccuracy, calendar, weakest } from "../lib/progressPage";

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
 * 2026-11-22: the page Rafil approved in the mockup. Around the deck tree:
 * this week by day, accuracy by week, what to go over (mistakes waiting and
 * the weakest topics) and the days studied. Your year moved to Home.
 * Right and wrong by day come from my_answer_days (0093); offline, the week
 * falls back to the device's own counts and the accuracy line waits.
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
            <Figure node={node} depth={depth} withPct />
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
        <Bar node={node} depth={depth} />
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
  activity = {}, streak = null, sessions = [], srCards = {}, onPractise,
}) {
  const [open, setOpen] = useState(() => new Set());
  const [answerDays, setAnswerDays] = useState(null);

  useEffect(() => {
    let live = true;
    fetchAnswerDays().then(d => { if (live) setAnswerDays(d); }, () => {});
    return () => { live = false; };
  }, []);

  const roots = useMemo(
    () => buildTree(QUESTIONS, decks, pStats),
    [decks, pStats],
  );

  function practiceLeaves(leaves) {
    setStudyScope?.("all");
    setLaunchFilter({ leaves });
    setView(V.STUDY);
  }
  /* By leaf id, not by name. Study filters on leaves — the deck ids with
     nothing under them — and that is the only identifier here that cannot be
     ambiguous: two decks may share a name. */
  const practice = node => practiceLeaves(leavesUnder(node));

  function toggle(id) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const summary = useMemo(() => summarise(roots, pStats), [roots, pStats]);
  const attempted = useMemo(() => seenCount(QUESTIONS, pStats) > 0, [pStats]);
  /* Just the two figures (Rafil, 2026-11-22): no "X is going best" or "Y is
     untouched", which read badly with ready-made decks ("Year 3 and Year 3
     are untouched"). Counted as Home counts them, so the two pages agree. */
  const answeredAll = Object.values(pStats).reduce((a, v) => a + (Number(v?.total) || 0), 0);
  const rightAll = Object.values(pStats).reduce((a, v) => a + (Number(v?.correct) || 0), 0);
  const lead = answeredAll > 0
    ? `You’ve answered ${answeredAll.toLocaleString("en-GB")} question${answeredAll === 1 ? "" : "s"}, ${Math.round((rightAll / answeredAll) * 100)}% right.`
    : summary?.lead;
  const rest = answeredAll > 0 ? "" : summary?.rest ?? "";

  const week = useMemo(() => weekDays(answerDays, activity), [answerDays, activity]);
  const weekTotal = week.reduce((a, d) => a + d.answered, 0);
  const weekRight = answerDays ? week.reduce((a, d) => a + (d.correct ?? 0), 0) : null;
  const weekNote = weekTotal ? weekLine(week, answerDays, activity) : "Nothing answered yet this week.";
  const weeks = useMemo(() => (answerDays ? weeklyAccuracy(answerDays) : []), [answerDays]);
  const drawn = weeks.filter(w => w.pct !== null);
  const cal = useMemo(() => calendar(activity), [activity]);
  const weak = useMemo(() => weakest(roots), [roots]);
  const mistakes = useMemo(() => waitingMistakes(sessions, srCards, new Set(QUESTIONS.map(q => q.id))), [sessions, srCards]);
  const seenAll = roots.reduce((a, r) => a + r.seen, 0);
  const totalAll = roots.reduce((a, r) => a + r.total, 0);
  const days = Number(streak?.streak) || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band pv-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <div className="pv-band__text">
          <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Progress</h1>
          {lead && (
            <p className="prog-lead" data-in="left" style={{ "--i": 1 }}>
              <span className="prog-lead-first">{lead}</span>
              {rest ? <> {rest}</> : null}
            </p>
          )}
        </div>
        {days > 0 && (
          <div className="pv-streak" data-in="left" style={{ "--i": 2 }} aria-label={`${days}-day streak, best ${Math.max(days, Number(streak?.longest) || 0)}`}>
            <StreakFlame days={days} bare size={44} />
            <span>
              <span className="pv-streak__n">{days}</span>
              <span className="pv-streak__t">day streak<br />best {Math.max(days, Number(streak?.longest) || 0)}</span>
            </span>
          </div>
        )}
      </div>

      <Wave from="transparent" to="var(--c-surface2)" />

      <div style={{ background: "var(--c-surface2)", flex: 1, display: "flex", flexDirection: "column" }}>
        {roots.length === 0 ? <Blank onGenerate={() => setView(V.GENERATE)} /> : (
          <div className="pv-sheet" style={{ ...band }}>
            <div className="pv-col">
              <section className="prog-card anim-scale-in" style={{ "--i": 0 }}>
                <div className="prog-card-head">
                  <h2 className="prog-card-title">This week</h2>
                  {weekTotal > 0 && (
                    <span className="pv-fig"><b>{weekTotal}</b> question{weekTotal === 1 ? "" : "s"}{weekRight !== null && weekTotal ? <> · <b>{Math.round((weekRight / weekTotal) * 100)}%</b> right</> : null}</span>
                  )}
                </div>
                <p className="pv-line">{weekNote}</p>
                <WeekBars week={week} split={!!answerDays} />
                {answerDays && weekTotal > 0 && (
                  <div className="pv-key"><span><i className="is-right" />Right</span><span><i className="is-wrong" />Wrong</span></div>
                )}
              </section>

              {drawn.length >= 2 && (
                <section className="prog-card anim-scale-in" style={{ "--i": 1 }}>
                  <div className="prog-card-head">
                    <h2 className="prog-card-title">Accuracy over time</h2>
                    <span className="pv-fig">Last {weeks.length} weeks</span>
                  </div>
                  <p className="pv-line">From <b>{drawn[0].pct}%</b> to <b>{drawn[drawn.length - 1].pct}%</b>. Every week with 20 or more answers counts.</p>
                  <AccuracyChart weeks={weeks} />
                </section>
              )}

              <section className="prog-card anim-scale-in" style={{ "--i": 2 }}>
                <div className="prog-card-head">
                  <h2 className="prog-card-title">By deck</h2>
                  <span className="pv-fig"><b>{seenAll.toLocaleString("en-GB")}</b> of {totalAll.toLocaleString("en-GB")} seen</span>
                </div>
                <ul className="prog-subjects">
                  {roots.map(r => (
                    <Node key={r.id} node={r} depth={0} open={open} onToggle={toggle} onPractice={practice} />
                  ))}
                </ul>
              </section>
            </div>

            <div className="pv-col">
              {(mistakes.length > 0 || weak.length > 0) && (
                <section className="prog-card anim-scale-in" style={{ "--i": 1 }}>
                  <div className="prog-card-head"><h2 className="prog-card-title">Go over these</h2></div>
                  {mistakes.length > 0 && (
                    <>
                      <div className="pv-big">
                        <span className="pv-big__n">{mistakes.length}</span>
                        <span className="pv-big__t">question{mistakes.length === 1 ? "" : "s"} you got wrong<br />the last time you saw {mistakes.length === 1 ? "it" : "them"}</span>
                      </div>
                      <button type="button" className="pv-go btn-press" onClick={() => onPractise?.(mistakes)}>Go over {mistakes.length === 1 ? "it" : "them"}</button>
                    </>
                  )}
                  {weak.length > 0 && (
                    <>
                      <div className={`pv-sub${mistakes.length ? "" : " is-first"}`}>
                        <h3>Weakest topics</h3>
                        {weak.length > 1 && (
                          <button type="button" className="pv-link" onClick={() => practiceLeaves(weak.flatMap(w => leavesUnder(w.node)))}>
                            Practise all {weak.length} <span aria-hidden="true">→</span>
                          </button>
                        )}
                      </div>
                      <ul className="pv-weak">
                        {weak.map(w => (
                          <li key={w.node.id}>
                            <button type="button" className="pv-weak__row" onClick={() => practice(w.node)}>
                              <span className="pv-weak__line">
                                <span className="pv-weak__name">{w.node.name} {w.root !== w.node.name && <span className="pv-weak__deck">· {w.root}</span>}</span>
                                <span className="pv-weak__pct">{w.pct}% <span>of {w.node.attempts}</span></span>
                              </span>
                              <span className="prog-bar"><span className="prog-bar-seen" style={{ transform: "scaleX(1)" }} /><span className="prog-bar-right" style={{ transform: `scaleX(${w.pct / 100})` }} /></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}

              <section className="prog-card anim-scale-in" style={{ "--i": 2 }}>
                <div className="prog-card-head">
                  <h2 className="prog-card-title">Days studied</h2>
                  <span className="pv-fig">Last 16 weeks</span>
                </div>
                <Calendar cal={cal} />
                <dl className="pv-pair">
                  <div><dt>Days studied</dt><dd>{cal.studied} of {cal.total}</dd></div>
                  {cal.mostActive && <div><dt>Most active</dt><dd>{cal.mostActive}</dd></div>}
                </dl>
              </section>

            </div>

            <div className="pv-full pv-foot">
              <button type="button" className="pv-link" onClick={() => setView(V.STUDY)}>Past sessions <span aria-hidden="true">→</span></button>
              {/* Only once there is something to undo. Two destructive buttons
                  are not an introduction to a page. */}
              {attempted && (
                <div className="prog-reset pv-reset">
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
          </div>
        )}
      </div>
    </div>
  );
}

/* Monday to Sunday: right solid, wrong faded, the count above. Offline the
   days have no split, so each bar is one colour. */
function WeekBars({ week, split }) {
  const peak = Math.max(1, ...week.map(d => d.answered));
  return (
    <div className="pv-week">
      {week.map((d, i) => {
        const h = d.answered ? Math.max(4, (d.answered / peak) * 110) : 3;
        const right = split ? d.correct ?? 0 : d.answered;
        return (
          <div key={d.day} className={`pv-day${d.answered ? "" : " is-empty"}${d.today ? " is-today" : ""}${d.future ? " is-future" : ""}`} style={{ "--i": i }}>
            <span className="pv-day__n">{d.answered || ""}</span>
            <span className="pv-day__stack" style={{ height: h }}>
              {d.answered > 0 && <span className="pv-day__right" style={{ flex: right }} />}
              {d.answered > 0 && split && d.answered - right > 0 && <span className="pv-day__wrong" style={{ flex: d.answered - right }} />}
            </span>
            <span className="pv-day__d">{d.today ? "Today" : d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Weekly accuracy on one fixed scale, 50 to 100% (below 50 sits on the floor),
   so a rise looks like a rise. Weeks with too few answers are gaps. */
function AccuracyChart({ weeks }) {
  const W = 560, H = 210, L = 38, R = 50, T = 14, B = 30;
  const lo = Math.min(50, ...weeks.filter(w => w.pct !== null).map(w => Math.floor(w.pct / 10) * 10));
  const hi = 100;
  const x = i => L + (i * (W - L - R)) / Math.max(1, weeks.length - 1);
  const y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const ticks = [];
  for (let v = lo; v <= hi; v += lo <= 30 ? 20 : 10) ticks.push(v);
  const pts = weeks.map((w, i) => (w.pct === null ? null : [x(i), y(w.pct), w.pct])).filter(Boolean);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${y(lo)} L${pts[0][0]},${y(lo)} Z` : "";
  const end = pts[pts.length - 1];
  const last = weeks.length - 1;
  return (
    <svg className="pv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly accuracy from ${pts[0][2]}% to ${end[2]}%`}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="pv-chart__grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">{v}%</text>
        </g>
      ))}
      <path d={area} className="pv-chart__area" />
      <path d={line} className="pv-chart__line" />
      {pts.map(([px, py], i) => i < pts.length - 1 && <circle key={i} cx={px} cy={py} r="3" className="pv-chart__dot" />)}
      <circle cx={end[0]} cy={end[1]} r="6" className="pv-chart__end" />
      <text className="t-end" x={end[0] + 12} y={end[1] + 4}>{end[2]}%</text>
      <text x={x(0)} y={H - 8} textAnchor="start">{weeks.length} weeks ago</text>
      <text x={x(last)} y={H - 8} textAnchor="end">This week</text>
    </svg>
  );
}

function Calendar({ cal }) {
  return (
    <div className="pv-cal-wrap">
      <div className="pv-cal-box">
        <div className="pv-cal" role="img" aria-label={`Studied on ${cal.studied} of the last ${cal.total} days`}>
          {cal.cells.map((c, i) => (c
            ? <i key={i} data-l={c.level} className={c.today ? "is-today" : undefined} title={`${c.day}: ${c.n} answered`} />
            : <i key={i} className="is-future" />))}
        </div>
        <div className="pv-cal-months">
          {cal.months.map(m => <span key={`${m.name}${m.week}`} style={{ gridColumn: m.week + 1 }}>{m.name}</span>)}
        </div>
      </div>
    </div>
  );
}
