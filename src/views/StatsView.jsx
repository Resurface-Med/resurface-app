import { useMemo, useState } from "react";
import { V, h1, sectionH, OF } from "../ui/theme";
import { QUESTIONS, CURRICULUM } from "../data";
import Wave from "../ui/Wave";

/**
 * Progress — coverage and accuracy by subject, then drill into topics.
 *
 * One list you can scan: block → subjects with a real coverage bar → topics
 * with a Practice action. Weak topics sort first inside each subject.
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
  return { total: qs.length, seen, pct, cover: qs.length ? seen / qs.length : 0 };
}

function CoverageBar({ value, label }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span
      className="prog-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <span className="prog-bar-fill" style={{ transform: `scaleX(${v})` }} />
    </span>
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

  return (
    <div className={`prog-subject${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="prog-subject-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="prog-subject-name">{deck}</span>
        <CoverageBar value={d.cover} label={`${deck} coverage`} />
        <span className="prog-subject-nums">
          {d.pct !== null ? (
            <span className={`prog-pct${d.pct < 60 ? " is-weak" : d.pct >= 70 ? " is-ok" : ""}`}>
              {d.pct}%
            </span>
          ) : (
            <span className="prog-pct is-empty">—</span>
          )}
          <span className="prog-seen">{d.seen}/{d.total}</span>
        </span>
        <span className={`prog-chevron${open ? " is-open" : ""}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <ul className="prog-topics">
          {sorted.map(cat => {
            const t = topicStats(cat, pStats);
            return (
              <li key={cat} className="prog-topic">
                <div className="prog-topic-main">
                  <span className="prog-topic-name">{shortCat(cat, deck)}</span>
                  <span className="prog-topic-meta">
                    {t.pct !== null ? (
                      <span className={`prog-pct${t.pct < 60 ? " is-weak" : t.pct >= 70 ? " is-ok" : ""}`}>
                        {t.pct}%
                      </span>
                    ) : (
                      <span className="prog-pct is-empty">—</span>
                    )}
                    <span className="prog-seen">{t.seen}/{t.total}</span>
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
  /* First block open, the rest shut — every block repeats the same subjects. */
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
    return { accuracy, seen, cover: QUESTIONS.length ? seen / QUESTIONS.length : 0 };
  }, [pStats]);

  const blocks = CURRICULUM;
  const { accuracy, seen, cover } = overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Progress</h1>
        <p className="prog-lead" data-in="left" style={{ "--i": 1 }}>
          {seen === 0
            ? "Nothing attempted yet. Answer a few questions and this fills in."
            : "Coverage and accuracy across the bank."}
        </p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div className="prog-sheet" style={{ ...band }}>
          <div className="prog-overview" aria-label="Overview" data-in="rise" style={{ "--i": 2 }}>
            <div className="prog-overview-stats">
              <div className="prog-field-stat">
                <span className="prog-field-value">
                  {accuracy === null ? "—" : accuracy}
                  {accuracy !== null && <span className="prog-field-unit">%</span>}
                </span>
                <span className="prog-field-label">Accuracy</span>
              </div>
              <div className="prog-field-stat">
                <span className="prog-field-value">
                  {seen}
                  <span className="prog-field-unit">/{QUESTIONS.length}</span>
                </span>
                <span className="prog-field-label">Seen</span>
              </div>
            </div>
            <div className="prog-overview-cover">
              <CoverageBar value={cover} label="Overall coverage" />
              <span className="prog-overview-cover-note">
                {Math.round(cover * 100)}% of the bank seen
              </span>
            </div>
          </div>

          <h2 className="prog-sheet-title" style={sectionH}>Subjects</h2>

          {blocks.map(b => {
            const bOpen = openBlocks.has(b.block);
            const topicCount = b.decks.reduce((n, d) => n + d.cats.length, 0);
            return (
              <section key={b.block} className="prog-block" data-in="rise" style={{ "--i": 4 }}>
                <button
                  type="button"
                  className={`prog-block-head${bOpen ? " is-open" : ""}`}
                  onClick={() => toggleBlockOpen(b.block)}
                  aria-expanded={bOpen}
                >
                  <span className="prog-block-name">{b.block}</span>
                  <span className="prog-block-meta">
                    {b.decks.length} subject{b.decks.length === 1 ? "" : "s"}
                    <span aria-hidden="true"> · </span>
                    {topicCount} topics
                  </span>
                  <span className={`prog-chevron${bOpen ? " is-open" : ""}`} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                      <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {bOpen && (
                  <div className="prog-subjects">
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
