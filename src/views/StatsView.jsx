import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { V, h1 } from "../ui/theme";
import { QUESTIONS } from "../data";
import Wave from "../ui/Wave";
import { confirm } from "../ui/Confirm";
import StreakFlame from "../ui/StreakFlame";
import { seenCount, buildTree, leavesUnder, pctOf } from "../lib/progress";
import { buildForest } from "../lib/decks";
import { waitingMistakes } from "../lib/pastSessions";
import { fetchAnswerDays } from "../lib/remote";
import { weekDays, weekLine, weeklyAccuracy, smoothPath, calendar, weakest } from "../lib/progressPage";

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

const TABS = [
  { k: "decks", label: "Decks" },
  { k: "activity", label: "Activity" },
  { k: "over", label: "Go over" },
];

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
  const [answerDays, setAnswerDays] = useState(null);
  /* The tab, kept for the visit so coming back to Progress lands where you
     were. */
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem("pv-tab") || "decks"; } catch { return "decks"; } });
  const pickTab = k => { setTab(k); try { sessionStorage.setItem("pv-tab", k); } catch { /* private mode */ } };

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
  const cal = useMemo(() => calendar(activity), [activity]);
  const weeks = useMemo(() => (answerDays ? weeklyAccuracy(answerDays, undefined, 12) : []), [answerDays]);
  const weak = useMemo(() => weakest(roots), [roots]);
  const mistakes = useMemo(() => waitingMistakes(sessions, srCards, new Set(QUESTIONS.map(q => q.id))), [sessions, srCards]);
  /* By deck is the deck list as Study draws it (Rafil, 2026-11-22: "the
     same deck ui as the decks"): buildForest, which knows ready-made decks
     and the ones of yours served back as them, so no duplicate "Year 3, 0
     of 0"; yours first, the ready-made ones under their heading. */
  const forest = useMemo(() => withAccuracy(prune(buildForest({ questions: QUESTIONS, decks, pStats, eligible: new Set(QUESTIONS.map(q => q.id)) })), pStats), [decks, pStats]);
  const ownRoots = forest.filter(n => !n.featured);
  const featRoots = forest.filter(n => n.featured);
  const seenAll = forest.reduce((a, r) => a + r.seen, 0);
  const totalAll = forest.reduce((a, r) => a + r.total, 0);
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
          <div className="pv-sheet is-tabs" style={{ ...band }}>
            {/* Tabs (Rafil, 2026-11-22: "extremely heavy"), Study's deck-tab
                pills: one part of the page at a time. */}
            <div className="tg-tabs pv-tabs" role="tablist" aria-label="Progress">
              {TABS.map(t => (
                <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
                  className={`tg-tab${tab === t.k ? " is-active" : ""}`} onClick={() => pickTab(t.k)}>
                  {t.label}{t.k === "over" && mistakes.length > 0 ? <span className="pv-tab-n">{mistakes.length}</span> : null}
                </button>
              ))}
            </div>

            {tab === "decks" && (
              <section className="prog-card anim-scale-in" style={{ "--i": 0 }}>
                <div className="prog-card-head">
                  <h2 className="prog-card-title">By deck</h2>
                  <span className="pv-fig"><b>{seenAll.toLocaleString("en-GB")}</b> of {totalAll.toLocaleString("en-GB")} seen</span>
                </div>
                <TopicMap roots={[...ownRoots, ...featRoots]} onPractice={practice} />
              </section>
            )}

            {tab === "activity" && (
              <>
              <section className="prog-card anim-scale-in" style={{ "--i": 1 }}>
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
              {weeks.filter(w => w.pct !== null).length >= 2 && (
                <section className="prog-card anim-scale-in" style={{ "--i": 2 }}>
                  <div className="prog-card-head">
                    <h2 className="prog-card-title">Accuracy over time</h2>
                    <span className="pv-fig">Last {weeks.length} weeks</span>
                  </div>
                  <AccuracyChart weeks={weeks} />
                </section>
              )}

              <section className="prog-card anim-scale-in" style={{ "--i": 3 }}>
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
              </>
            )}

            {tab === "over" && (mistakes.length > 0 || weak.length > 0 ? (
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
            ) : (
              <section className="prog-card anim-scale-in">
                <div className="prog-card-head"><h2 className="prog-card-title">Nothing to go over</h2></div>
                <p className="pv-line">Questions you get wrong, and the topics you find hardest, show up here.</p>
              </section>
            ))}

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

/* ── By deck ──────────────────────────────────────────────────────────── */

/* Decks with no questions in them go: an empty deck has no progress. */
function prune(nodes) {
  return nodes.filter(n => n.total > 0).map(n => ({ ...n, children: prune(n.children) }));
}
/* buildForest counts questions seen; this adds answers and right answers
   to every deck, from each question's path. */
function withAccuracy(forest, pStats) {
  const acc = new Map();
  for (const q of QUESTIONS) {
    const st = pStats[q.id];
    if (!st) continue;
    for (const step of q.path ?? []) {
      const a = acc.get(step.id) ?? { attempts: 0, correct: 0 };
      a.attempts += Number(st.total) || 0;
      a.correct += Number(st.correct) || 0;
      acc.set(step.id, a);
    }
  }
  const walk = n => ({ ...n, ...(acc.get(n.id) ?? { attempts: 0, correct: 0 }), children: n.children.map(walk) });
  return forest.map(walk);
}

/* ── Accuracy over time ───────────────────────────────────────────────── */

const fmtWeek = start => new Date(`${start}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/*
 * Weekly accuracy, scrubbable (Rafil, 2026-11-22: "much better, and
 * scrubbable"). Drawn at the card's real width, so the type stays its size
 * on any screen. The line is smooth but never overshoots a week; each week's
 * answers are faint bars along the floor. Move across it — pointer, finger
 * (a sideways drag; the page still scrolls up and down) or arrow keys — and
 * the readout above follows; it rests on this week. A week with under 20
 * answers is a gap in the line, and says so when you land on it.
 */
function AccuracyChart({ weeks }) {
  const box = useRef(null);
  const [w, setW] = useState(640);
  const last = weeks.length - 1;
  /* null rests on this week, however many weeks there are. */
  const [picked, setAt] = useState(null);
  const at = picked === null ? last : Math.min(picked, last);
  const [scrub, setScrub] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 230, L = 40, R = 14, T = 18, B = 34;
  const rated = weeks.filter(x => x.pct !== null).map(x => x.pct);
  const lo = Math.max(0, Math.min(50, Math.floor((Math.min(...rated) - 5) / 10) * 10));
  const hi = 100;
  const x = i => L + (i * (w - L - R)) / Math.max(1, last);
  const y = v => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const floor = H - B;
  const maxAns = Math.max(1, ...weeks.map(k => k.answered));
  const barW = Math.max(6, Math.min(26, ((w - L - R) / weeks.length) * 0.42));

  /* Segments of consecutive rated weeks, so a quiet week breaks the line. */
  const segs = [];
  let cur = [];
  weeks.forEach((k, i) => { if (k.pct === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(k.pct), i]); });
  if (cur.length) segs.push(cur);

  const ticks = [];
  for (let v = lo; v <= hi; v += (hi - lo) > 50 ? 20 : 10) ticks.push(v);

  const k = weeks[at];
  const prev = weeks.slice(0, at).reverse().find(p => p.pct !== null);
  const delta = k.pct !== null && prev ? k.pct - prev.pct : null;
  const pick = clientX => {
    const r = box.current.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - L) / Math.max(1, w - L - R)) * last);
    setAt(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="pv-acc">
      <div className="pv-acc__read" aria-live="polite">
        <span className="pv-acc__pct">{k.pct === null ? "—" : `${k.pct}%`}</span>
        <span className="pv-acc__meta">
          <span className="pv-acc__when">{at === last ? "This week" : `Week of ${fmtWeek(k.start)}`}</span>
          <span className="pv-acc__sub">
            {k.pct === null
              ? (k.answered ? `${k.answered} answered, too few to judge` : "Nothing answered")
              : <>{k.answered} answered{delta !== null && <> · {delta === 0 ? "the same as the week before" : <><b className={delta > 0 ? "is-up" : "is-down"}>{delta > 0 ? "+" : "−"}{Math.abs(delta)} {Math.abs(delta) === 1 ? "point" : "points"}</b> on the week before</>}</>}</>}
          </span>
        </span>
      </div>
      <div
        ref={box}
        className={`pv-acc__plot${scrub ? " is-scrubbing" : ""}`}
        tabIndex={0}
        role="slider"
        aria-label="Week"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={at}
        aria-valuetext={`${at === last ? "This week" : `Week of ${fmtWeek(k.start)}`}: ${k.pct === null ? "not enough answers" : `${k.pct}% right`}`}
        onPointerDown={e => { setScrub(true); pick(e.clientX); e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerMove={e => { if (scrub || e.pointerType === "mouse") pick(e.clientX); }}
        onPointerUp={() => setScrub(false)}
        onPointerCancel={() => { setScrub(false); setAt(null); }}
        onPointerLeave={e => { if (e.pointerType === "mouse" && !scrub) setAt(null); }}
        onKeyDown={e => {
          if (e.key === "ArrowLeft") { e.preventDefault(); setAt(Math.max(0, at - 1)); }
          if (e.key === "ArrowRight") { e.preventDefault(); setAt(Math.min(last, at + 1)); }
          if (e.key === "Home") { e.preventDefault(); setAt(0); }
          if (e.key === "End") { e.preventDefault(); setAt(null); }
        }}
      >
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id="pv-acc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--c-accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--c-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="pv-acc__grid" />
              <text x={L - 10} y={y(v) + 4} textAnchor="end" className="pv-acc__tick">{v}%</text>
            </g>
          ))}
          {weeks.map((wk, i) => {
            const h = (wk.answered / maxAns) * (H - T - B) * 0.32;
            return h > 0 && <rect key={wk.start} x={x(i) - barW / 2} y={floor - h} width={barW} height={h} rx={Math.min(4, barW / 3)} className={`pv-acc__vol${i === at ? " is-at" : ""}`} />;
          })}
          {segs.map((sg, si) => sg.length > 1 && (
            <path key={`a${si}`} d={`${smoothPath(sg)} L${sg[sg.length - 1][0]},${floor} L${sg[0][0]},${floor} Z`} fill="url(#pv-acc-fill)" />
          ))}
          {/* A quiet week is a gap; a dashed bridge keeps the line readable. */}
          {segs.slice(1).map((sg, si) => {
            const a = segs[si][segs[si].length - 1], b = sg[0];
            return <line key={`g${si}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="pv-acc__bridge" />;
          })}
          {segs.map((sg, si) => (sg.length > 1
            ? <path key={`l${si}`} d={smoothPath(sg)} className="pv-acc__line" />
            : <circle key={`l${si}`} cx={sg[0][0]} cy={sg[0][1]} r="3.5" className="pv-acc__dot" />))}
          <line x1={x(at)} x2={x(at)} y1={T - 6} y2={floor} className="pv-acc__guide" />
          {k.pct !== null && <circle cx={x(at)} cy={y(k.pct)} r="7" className="pv-acc__at" />}
          {weeks.map((wk, i) => {
            /* A date under every few weeks, as many as fit, always the ends. */
            const every = Math.max(1, Math.ceil(weeks.length / Math.max(2, Math.floor((w - L - R) / 78))));
            /* Never so near "This week" that the two run together. */
            const show = i === last || (i % every === 0 && x(last) - x(i) >= 92);
            if (!show) return null;
            return <text key={`t${wk.start}`} x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className={`pv-acc__tick${i === at ? " is-at" : ""}`}>{i === last ? "This week" : fmtWeek(wk.start)}</text>;
          })}
        </svg>
      </div>
      <p className="pv-acc__hint">Drag along the chart to see any week. Bars show how many you answered.</p>
    </div>
  );
}

/* ── Topic map ─────────────────────────────────────────────────────────── */

/*
 * Every lecture at once (Rafil, 2026-11-22: "they need to be able to see
 * everything, every available topic, but make it compact"). No expanding:
 * each deck at the top is a heading; under it, each group of lectures (the
 * deck that holds them, named by its path: "Neuro · Anatomy") has a small
 * heading of its own, and its lectures are one short row each, flowed into
 * as many columns as fit. A row is the name, the seen-and-right bar and the
 * percentage; a lecture not started is greyed. Tap a lecture to practise it,
 * a group's heading to practise the group.
 */
function sectionsOf(root) {
  const out = [];
  (function walk(n, path) {
    const leaves = n.children.filter(c => !c.children.length);
    const deeper = n.children.filter(c => c.children.length);
    if (!n.children.length) out.push({ node: n, path, items: [n] });
    else if (leaves.length) out.push({ node: n, path, items: leaves });
    for (const c of deeper) walk(c, n === root ? [c.name] : [...path, c.name]);
  })(root, []);
  return out;
}

function figs(n) {
  const pct = n.attempts >= 5 ? Math.round((n.correct / n.attempts) * 100) : null;
  const seen = n.total ? n.seen / n.total : 0;
  const right = pct === null ? 0 : seen * (pct / 100);
  return { pct, seen, right };
}

function TopicMap({ roots, onPractice }) {
  /* A deck with nothing inside it would be a heading over a row of its own
     name. Those are gathered into one group of rows instead. */
  const singles = roots.filter(r => !r.children.length);
  const grouped = singles.length
    ? [{ id: "__singles", name: "Your decks", seen: singles.reduce((a, r) => a + r.seen, 0), total: singles.reduce((a, r) => a + r.total, 0),
        attempts: singles.reduce((a, r) => a + r.attempts, 0), correct: singles.reduce((a, r) => a + r.correct, 0), children: singles, singles: true },
      ...roots.filter(r => r.children.length)]
    : roots;
  return (
    <div className="tm">
      {grouped.map(root => {
        const r = figs(root);
        return (
          <section key={root.id} className="tm-root">
            <div className="tm-root__head">
              <h3 className="tm-root__name">{root.name}{root.byline && root.children.length === 0 ? <span className="topic-by"> by {root.byline}</span> : null}</h3>
              <span className="tm-root__fig">{root.seen.toLocaleString("en-GB")} of {root.total.toLocaleString("en-GB")}{r.pct !== null && <b> · {r.pct}%</b>}</span>
            </div>
            {(root.singles ? [{ node: root, path: [], items: root.children }] : sectionsOf(root)).map(sec => {
              const f = figs(sec.node);
              const title = sec.path.length ? sec.path.join(" · ") : null;
              return (
                <div key={sec.node.id} className="tm-sec">
                  {title && (
                    <button type="button" className="tm-sec__head" onClick={() => onPractice(sec.node)} aria-label={`Practise ${title}`}>
                      <span className="tm-sec__name">{title}{sec.node.byline && <span className="topic-by"> by {sec.node.byline}</span>}</span>
                      <span className="tm-sec__fig">{sec.node.seen} of {sec.node.total}{f.pct !== null && <> · {f.pct}%</>}</span>
                    </button>
                  )}
                  <ul className="tm-grid">
                    {sec.items.map(n => {
                      const g = figs(n);
                      return (
                        <li key={n.id}>
                          <button type="button" className={`tm-row${n.seen === 0 ? " is-untouched" : ""}`} onClick={() => onPractice(n)} title={`${n.name}: ${n.seen} of ${n.total} seen${g.pct !== null ? `, ${g.pct}% right` : ""}`}>
                            <span className="tm-row__line">
                              <span className="tm-row__name">{n.name}</span>
                              <span className="tm-row__pct">{g.pct === null ? (n.seen ? "" : "—") : `${g.pct}%`}</span>
                            </span>
                            <span className="tm-bar" aria-hidden="true">
                              <span className="tm-bar__seen" style={{ width: `${g.seen * 100}%` }} />
                              <span className="tm-bar__right" style={{ width: `${g.right * 100}%` }} />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="pv-deck__key">The bar is how much you’ve seen; its solid part is how much you got right. Tap a lecture, or a heading, to practise it.</p>
    </div>
  );
}
