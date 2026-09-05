import { useMemo, useState } from "react";
import { V, h1, sectionH, OF } from "../ui/theme";
import { QUESTIONS, CURRICULUM } from "../data";
import Wave from "../ui/Wave";

/**
 * Progress — same quiet list language as Leaderboard / Home stats.
 * Scan subjects, open a topic, practise. No hero numerals.
 */

const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

function shortCat(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

function topicStats(cat, pStats) {
  const qs = QUESTIONS.filter(q => q.cat === cat);
  let correct = 0, attempts = 0, seen = 0;
  for (const q of qs) {
    const s = pStats[q.id];
    if (s) { correct += s.correct; attempts += s.total; seen++; }
  }
  const pct = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
  return { total: qs.length, seen, pct };
}

function deckStats(deck, pStats) {
  const qs = QUESTIONS.filter(q => q.deck === deck);
  let correct = 0, attempts = 0, seen = 0;
  for (const q of qs) {
    const s = pStats[q.id];
    if (s) { correct += s.correct; attempts += s.total; seen++; }
  }
  const pct = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
  return { total: qs.length, seen, pct };
}

function OverviewRow({ label, value, first = false }) {
  return (
    <div className={`prog-ov-row${first ? " is-first" : ""}`}>
      <span className="prog-ov-label">{label}</span>
      <span className="prog-ov-value">{value}</span>
    </div>
  );
}

function SubjectBlock({ deck, cats, pStats, open, onToggle, onPractice }) {
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

  const cover = d.total ? Math.round((d.seen / d.total) * 100) : 0;

  return (
    <div className={`prog-subject${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="prog-subject-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="prog-subject-name">{deck}</span>
        <span className="prog-subject-meta">
          {d.pct !== null && (
            <span className={`prog-acc${d.pct < 60 ? " is-weak" : ""}`}>{d.pct}%</span>
          )}
          <span>{d.seen}/{d.total}</span>
          <span className="prog-cover">{cover}%</span>
        </span>
        <span className={`prog-chevron${open ? " is-open" : ""}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <ul className="prog-topics">
          {sorted.map(cat => {
            const t = topicStats(cat, pStats);
            return (
              <li key={cat} className="prog-topic">
                <div className="prog-topic-copy">
                  <span className="prog-topic-name">{shortCat(cat, deck)}</span>
                  <span className="prog-topic-meta">
                    {t.pct !== null ? (
                      <span className={`prog-acc${t.pct < 60 ? " is-weak" : ""}`}>{t.pct}%</span>
                    ) : (
                      <span className="prog-acc is-empty">—</span>
                    )}
                    <span>{t.seen}/{t.total}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="prog-practice btn-press"
                  onClick={() => onPractice(deck, cat)}
                >
                  Practice
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function StatsView({
  pStats, setView, setLaunchFilter, setStudyScope, onClearP, onClearSR,
}) {
  const [openDecks, setOpenDecks] = useState(() => new Set());
  const [openBlocks, setOpenBlocks] = useState(() => new Set([CURRICULUM[0]?.block].filter(Boolean)));

  function toggleBlockOpen(name) {
    setOpenBlocks(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function practice(deck, cat) {
    setStudyScope?.("all");
    setLaunchFilter({ deck, cat });
    setView(V.STUDY);
  }

  function toggleDeck(deck) {
    setOpenDecks(prev => {
      const next = new Set(prev);
      next.has(deck) ? next.delete(deck) : next.add(deck);
      return next;
    });
  }

  const overview = useMemo(() => {
    const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
    const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
    const accuracy = totalT > 0 ? Math.round((totalC / totalT) * 100) : null;
    const seen = Object.keys(pStats).length;
    const cover = QUESTIONS.length ? Math.round((seen / QUESTIONS.length) * 100) : 0;
    return { accuracy, seen, cover };
  }, [pStats]);

  const blocks = CURRICULUM;
  const { accuracy, seen, cover } = overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Progress</h1>
        <p data-in="left" style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em", "--i": 1 }}>
          {seen === 0
            ? "Nothing attempted yet. Answer a few questions and this fills in."
            : "How each subject is going — open one to practise a topic."}
        </p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>

          <section className="prog-overview" data-in="rise" style={{ "--i": 2 }} aria-label="Overview">
            <div className="prog-section-head">
              <h2 style={{ ...sectionH, margin: 0 }}>Overview</h2>
            </div>
            <OverviewRow
              first
              label="Accuracy"
              value={accuracy === null ? "—" : `${accuracy}%`}
            />
            <OverviewRow
              label="Seen"
              value={`${seen.toLocaleString()} of ${QUESTIONS.length.toLocaleString()}`}
            />
            <OverviewRow
              label="Bank covered"
              value={`${cover}%`}
            />
            <div className="prog-ov-track" aria-hidden="true">
              <span style={{ width: `${cover}%` }} />
            </div>
          </section>

          {blocks.map((b, bi) => {
            const bOpen = openBlocks.has(b.block);
            const topicCount = b.decks.reduce((n, d) => n + d.cats.length, 0);
            return (
              <section key={b.block} className="prog-block" data-in="rise" style={{ "--i": 3 + bi }}>
                <button
                  type="button"
                  className={`prog-block-head${bOpen ? " is-open" : ""}`}
                  onClick={() => toggleBlockOpen(b.block)}
                  aria-expanded={bOpen}
                >
                  <span className="prog-block-name">{b.block}</span>
                  <span className="prog-block-meta">
                    {b.decks.length} subjects · {topicCount} topics
                  </span>
                  <span className={`prog-chevron${bOpen ? " is-open" : ""}`} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                      <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {bOpen && (
                  <div className="prog-subjects">
                    <div className="prog-col-head" aria-hidden="true">
                      <span>Subject</span>
                      <span>Accuracy · seen · covered</span>
                    </div>
                    {b.decks.map(d => (
                      <SubjectBlock
                        key={`${b.block}/${d.deck}`}
                        deck={d.deck}
                        cats={d.cats}
                        pStats={pStats}
                        open={openDecks.has(d.deck)}
                        onToggle={() => toggleDeck(d.deck)}
                        onPractice={practice}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          <div className="prog-reset">
            <button
              type="button"
              className="prog-reset-btn"
              onClick={() => { if (window.confirm("Reset practice stats for every question?")) onClearP?.(); }}
            >
              Reset practice stats
            </button>
            <button
              type="button"
              className="prog-reset-btn"
              onClick={() => { if (window.confirm("Reset review schedules?")) onClearSR?.(); }}
            >
              Reset review schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
