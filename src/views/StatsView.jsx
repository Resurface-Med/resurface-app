import { useMemo, useState } from "react";
import { V, h1, sectionH, OF } from "../ui/theme";
import { QUESTIONS, DECK_MAP } from "../data";
import Wave from "../ui/Wave";

/**
 * Progress — what to open next, and how each subject is going.
 *
 * Two questions, two sections, and nothing appears twice. The page used to
 * answer four and repeat itself doing it: a spotlight card naming the weakest
 * topic, a "Still under" list whose first row was that same topic, subject
 * accordions containing it a third time, and two more disclosures for topics
 * not started and topics doing fine. Four list treatments, three chevrons, one
 * topic in up to three places.
 *
 * Now: the weak topics, then the subjects. Not-started and steady topics live
 * inside their subject, which is where you would look for them, so the two
 * extra disclosures are gone rather than relocated. Dashboard still owns "how
 * far am I"; this page owns "what next".
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

function TopicActionRow({ title, meta, pct, onPractice }) {
  return (
    <div className="prog-row">
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
        <span className="prog-subject-line">
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
        </span>
        {/* Coverage, not accuracy — the number beside it is already accuracy,
            and one row should not show the same quantity twice or two
            quantities in one mark. Nine of these give the list a shape you can
            read down without reading any of the numbers. */}
        <span className="prog-subject-bar" aria-hidden="true">
          <span
            className="prog-subject-bar-fill"
            style={{ transform: `scaleX(${d.total ? d.seen / d.total : 0})` }}
          />
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

  const { weak, decks } = useMemo(() => {
    const weak = [];
    const cats = [...new Set(QUESTIONS.map(q => q.cat))];
    for (const cat of cats) {
      const t = topicStats(cat, pStats);
      if (t.pct !== null && t.pct < 60) {
        weak.push({ cat, deck: t.deck, pct: t.pct, seen: t.seen, total: t.total });
      }
    }
    weak.sort((a, b) => a.pct - b.pct);
    // Six is a list you act on. The rest of a bad week is in By subject, and
    // a page that opens with twenty things to fix is one you close.
    return { weak: weak.slice(0, 6), decks: Object.keys(DECK_MAP) };
  }, [pStats]);

  const { accuracy, seen, learned } = overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Progress</h1>
        <p data-in="left" style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2, maxWidth: "36em", "--i": 1 }}>
          {seen === 0
            ? "Nothing attempted yet. Answer a few questions and this fills in."
            : "What to open next, and how each subject is going."}
        </p>

        <div className="prog-field-stats" aria-label="Overview" data-in="rise" style={{ "--i": 2 }}>
          <FieldStat
            label="Accuracy"
            value={accuracy === null ? "—" : accuracy}
            unit={accuracy === null ? null : "%"}
          />
          <FieldStat label="Seen" value={`${seen}`} unit={`/${QUESTIONS.length}`} />
          <FieldStat label="In rotation" value={learned} />
        </div>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 720, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>

          {weak.length > 0 && (
            <section className="prog-section" data-in="rise" style={{ "--i": 3 }}>
              <div className="prog-section-head">
                <h2 style={{ ...sectionH, margin: 0 }}>Open these next</h2>
                <span className="prog-section-note">Under 60%, weakest first</span>
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

          <section className="prog-section" data-in="rise" style={{ "--i": 4 }}>
            <div className="prog-section-head">
              <h2 style={{ ...sectionH, margin: 0 }}>By subject</h2>
              <span className="prog-section-note">Bar is how much you’ve seen</span>
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
