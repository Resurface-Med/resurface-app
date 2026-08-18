import { useMemo, useState } from "react";
import { V, h1, sectionH, OF } from "../ui/theme";
import { QUESTIONS, DECK_MAP } from "../data";
import Wave from "../ui/Wave";

/**
 * Progress — personal depth, without the chart gimmick.
 *
 * Signature is typographic: name the one topic still furthest under, then the
 * actionable list. Dashboard already owns “how far am I”; this page owns
 * “open this next”.
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
  return { total: qs.length, seen, pct, deck: qs[0]?.deck ?? "" };
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

function FieldStat({ label, value, unit }) {
  return (
    <div className="prog-field-stat">
      <span className="prog-field-value">
        {value}
        {unit ? <span className="prog-field-unit">{unit}</span> : null}
      </span>
      <span className="prog-field-label">{label}</span>
    </div>
  );
}

function TopicActionRow({ title, meta, pct, onPractice, dim }) {
  return (
    <div className={`prog-row${dim ? " is-dim" : ""}`}>
      <div className="prog-row-main">
        <span className="prog-row-title">{title}</span>
        <span className="prog-row-meta">
          {pct !== null && pct !== undefined && (
            <span className={`prog-pct${pct < 60 ? " is-weak" : pct >= 70 ? " is-ok" : ""}`}>
              {pct}%
            </span>
          )}
          <span className="prog-seen">{meta}</span>
        </span>
      </div>
      {onPractice && (
        <button type="button" className="prog-practice btn-press" onClick={onPractice}>
          Practice
        </button>
      )}
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

  return (
    <div className="prog-subject">
      <button
        type="button"
        className={`prog-subject-head${open ? " is-open" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="prog-row-title">{deck}</span>
        <span className="prog-row-meta">
          {d.pct !== null && <span className="prog-pct">{d.pct}%</span>}
          <span className="prog-seen">{d.seen}/{d.total}</span>
          <span className={`prog-chevron${open ? " is-open" : ""}`} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </span>
      </button>

      {open && (
        <div className="prog-subject-cats">
          {sorted.map(cat => {
            const t = topicStats(cat, pStats);
            return (
              <TopicActionRow
                key={cat}
                title={shortCat(cat, deck)}
                meta={`${t.seen}/${t.total}`}
                pct={t.pct}
                onPractice={() => onPractice(deck, cat)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StatsView({
  pStats, srCards, setView, setLaunchFilter, setStudyScope, onClearP, onClearSR,
}) {
  const [openDecks, setOpenDecks] = useState(() => new Set());
  const [showRest, setShowRest] = useState({ untouched: false, steady: false });

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
    const learned = Object.values(srCards).filter(c => c.repetitions > 0).length;
    return { accuracy, seen, learned };
  }, [pStats, srCards]);

  const { weak, untouched, steady, decks, spotlight } = useMemo(() => {
    const weak = [];
    const untouched = [];
    const steady = [];

    const cats = [...new Set(QUESTIONS.map(q => q.cat))];
    for (const cat of cats) {
      const t = topicStats(cat, pStats);
      const row = { cat, deck: t.deck, pct: t.pct, seen: t.seen, total: t.total };
      if (t.pct === null) untouched.push(row);
      else if (t.seen === t.total && t.pct >= 70) steady.push(row);
      else if (t.pct < 60) weak.push(row);
    }
    weak.sort((a, b) => a.pct - b.pct);
    return {
      weak: weak.slice(0, 6),
      untouched,
      steady,
      decks: Object.keys(DECK_MAP),
      spotlight: weak[0] ?? null,
    };
  }, [pStats]);

  const { accuracy, seen, learned } = overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <h1 style={{ ...h1, margin: 0 }}>Progress</h1>
            {spotlight ? (
              <div className="prog-spotlight">
                <p className="prog-spotlight-kicker">Furthest under right now</p>
                <p className="prog-spotlight-title">
                  {shortCat(spotlight.cat, spotlight.deck)}
                </p>
                <p className="prog-spotlight-meta">
                  {spotlight.deck} · {spotlight.pct}% · {spotlight.seen}/{spotlight.total} seen
                </p>
                <button
                  type="button"
                  className="prog-spotlight-cta btn-press"
                  onClick={() => practice(spotlight.deck, spotlight.cat)}
                >
                  Practice this →
                </button>
              </div>
            ) : (
              <p style={{ marginTop: 10, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "34em" }}>
                {seen === 0
                  ? "Nothing attempted yet — start a session and this page fills in."
                  : "Nothing’s critically under. Keep the rhythm going."}
              </p>
            )}
          </div>

          <div className="prog-field-stats is-compact" aria-label="Overview">
            <FieldStat
              label="Accuracy"
              value={accuracy === null ? "—" : accuracy}
              unit={accuracy === null ? null : "%"}
            />
            <FieldStat label="Seen" value={`${seen}`} unit={`/${QUESTIONS.length}`} />
            <FieldStat label="In rotation" value={learned} />
          </div>
        </header>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>

          {weak.length > 0 && (
            <section className="prog-section">
              <div className="prog-section-head">
                <h2 style={{ ...sectionH, margin: 0 }}>Still under</h2>
                <span className="prog-section-note">Below 60% — pull these up first</span>
              </div>
              <div className="prog-list">
                {weak.map(row => (
                  <TopicActionRow
                    key={row.cat}
                    title={shortCat(row.cat, row.deck)}
                    meta={`${row.deck} · ${row.seen}/${row.total}`}
                    pct={row.pct}
                    onPractice={() => practice(row.deck, row.cat)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="prog-section">
            <div className="prog-section-head">
              <h2 style={{ ...sectionH, margin: 0 }}>By subject</h2>
              <span className="prog-section-note">Weakest topics first inside each</span>
            </div>
            <div className="prog-subjects">
              {decks.map(deck => (
                <SubjectBlock
                  key={deck}
                  deck={deck}
                  cats={DECK_MAP[deck] || []}
                  pStats={pStats}
                  open={openDecks.has(deck)}
                  onToggle={() => toggleDeck(deck)}
                  onPractice={practice}
                />
              ))}
            </div>
          </section>

          {(untouched.length > 0 || steady.length > 0) && (
            <section className="prog-section prog-section-quiet">
              {untouched.length > 0 && (
                <div className="prog-disclose">
                  <button
                    type="button"
                    className="prog-disclose-btn"
                    onClick={() => setShowRest(s => ({ ...s, untouched: !s.untouched }))}
                    aria-expanded={showRest.untouched}
                  >
                    <span>{untouched.length} not started yet</span>
                    <span className={`prog-chevron${showRest.untouched ? " is-open" : ""}`} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                        <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </button>
                  {showRest.untouched && (
                    <div className="prog-list">
                      {untouched.map(row => (
                        <TopicActionRow
                          key={row.cat}
                          title={shortCat(row.cat, row.deck)}
                          meta={row.deck}
                          pct={null}
                          dim
                          onPractice={() => practice(row.deck, row.cat)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {steady.length > 0 && (
                <div className="prog-disclose">
                  <button
                    type="button"
                    className="prog-disclose-btn"
                    onClick={() => setShowRest(s => ({ ...s, steady: !s.steady }))}
                    aria-expanded={showRest.steady}
                  >
                    <span>{steady.length} looking steady</span>
                    <span className={`prog-chevron${showRest.steady ? " is-open" : ""}`} aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                        <path d="M6.5 3.5L12 9l-5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </button>
                  {showRest.steady && (
                    <div className="prog-list">
                      {steady.map(row => (
                        <TopicActionRow
                          key={row.cat}
                          title={shortCat(row.cat, row.deck)}
                          meta={`${row.deck} · ${row.seen}/${row.total}`}
                          pct={row.pct}
                          dim
                          onPractice={() => practice(row.deck, row.cat)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

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
