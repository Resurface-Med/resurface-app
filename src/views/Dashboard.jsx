import { useMemo, useState } from "react";
import { C, V, h1, sectionH, eyebrowField, meta, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import ActivityHeatmap from "../ui/ActivityHeatmap";
import { QUESTIONS } from "../data";

/**
 * The home screen: three zones, not eight.
 *
 * The previous versions kept growing modules — a hero, a wave, four stat
 * tiles, a big accent card, two outlined cards, a goal bar, a heatmap, a
 * stats line — each individually reasonable and collectively exhausting.
 * The fix is fewer objects, not quieter ones: the blue field carries the
 * greeting *and* the actions (so there is exactly one accent moment on the
 * page), and the sheet below holds the two things a question bank owes you —
 * what's in the bank, and what you've done with it.
 *
 * The subject list is deliberately a list. Nine cards would have been nine
 * competing rectangles; nine rows read as one object.
 */

// Below this, a topic's percentage is noise rather than signal.
const MIN_ATTEMPTS = 3;

/** Categories are often prefixed with their own deck; the panel already says it. */
function topicLabel(cat, deck) {
  return cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

export default function Dashboard({
  pStats, streak, dueCount, setView,
  activity = {}, srCards = {}, dailyGoal = 20, onGoalChange, onStudy, onStudyTopic,
}) {
  const totalT = Object.values(pStats).reduce((s, v) => s + v.total, 0);
  const totalC = Object.values(pStats).reduce((s, v) => s + v.correct, 0);
  const acc = totalT > 0 ? Math.round(totalC / totalT * 100) : null;
  const seen = Object.keys(pStats).length;

  /**
   * Plain counters. No trends, because nothing here is stored with a timestamp
   * — practice_stats holds running totals and activity holds a daily count, so
   * "answered" and "days studied" are honest but "accuracy last week" is not
   * reconstructable.
   *
   * "Mastered" is the 21-day interval Anki uses for a mature card. It is the
   * one number here that separates questions you have retained from questions
   * you have merely met, which is why it earns a slot over something like
   * total time.
   */
  const mastered = useMemo(
    () => Object.values(srCards).filter(c => (c?.interval ?? 0) >= 21).length,
    [srCards],
  );

  /**
   * What the panel will look like once there is data in it.
   *
   * An empty state that only explains itself asks you to imagine the payoff.
   * Showing the real layout with real topic names from the bank makes the
   * promise concrete — you can see it is a ranked list of your weak spots
   * before you have earned one. Ghosted and labelled, because plausible
   * numbers at full strength would just be a lie.
   */
  const previewRows = useMemo(() => {
    const seenCats = new Set();
    const out = [];
    for (const q of QUESTIONS) {
      if (seenCats.has(q.cat)) continue;
      seenCats.add(q.cat);
      out.push({ cat: q.cat, deck: q.deck });
      if (out.length === 4) break;
    }
    return out.map((r, i) => ({ ...r, pct: 44 + i * 9, total: 12 - i * 2 }));
  }, []);

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  const todayCount = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return activity[key] || 0;
  }, [activity]);

  /**
   * The weakest topics you have actually attempted.
   *
   * Coverage — "62 of 153 seen" — was the wrong number. It says where you have
   * been, not what you do not know, and students do not make study decisions
   * from it. Accuracy per topic is what they act on: run questions to find the
   * gaps, then go at the gaps.
   *
   * Topics, not subjects: "Glycolysis & Bioenergetics at 45%" tells you what to
   * open tonight, "Biochemistry" does not. MIN_ATTEMPTS keeps a single unlucky
   * question from parking a topic at the top of the list.
   */
  const weakest = useMemo(() => {
    const by = new Map();
    for (const q of QUESTIONS) {
      const s = pStats[q.id];
      if (!s || !s.total) continue;
      let row = by.get(q.cat);
      if (!row) { row = { cat: q.cat, deck: q.deck, correct: 0, total: 0 }; by.set(q.cat, row); }
      row.correct += s.correct;
      row.total += s.total;
    }
    return [...by.values()]
      .filter(r => r.total >= MIN_ATTEMPTS)
      .map(r => ({ ...r, pct: Math.round((r.correct / r.total) * 100) }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5);
  }, [pStats]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  // Reviews first — a lapsed interval is the only thing here that actually
  // decays. Everything else is still there tomorrow.
  const primary =
    dueCount > 0
      ? { scope: "due", label: `Review ${dueCount} due` }
      : { scope: "all", label: seen === 0 ? "Start studying" : "Practice anything" };

  const secondary = [
    dueCount > 0 && { scope: "all",   label: "Practice anything" },
    seen > 0     && { scope: "wrong", label: "Fix what you missed" },
  ].filter(Boolean);

  const band = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "0 clamp(20px, 3vw, 40px)",
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      {/* ── Blue field: who you are, and the one thing to do ───────── */}
      <div style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(20px, 3vh, 30px)" }}>
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          gap: 20, flexWrap: "wrap",
          animation: "dash-left 0.26s cubic-bezier(0.22,1,0.36,1) both",
        }}>
          <div>
            <span style={eyebrowField}>{todayLabel}</span>
            <h1 style={{ ...h1, marginTop: 10 }}>{greeting}.</h1>
          </div>

          {streak.streak > 0 && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: "clamp(26px, 2.6vw, 32px)", fontWeight: 700, color: OF.text, letterSpacing: -1.4, lineHeight: 1 }}>
                {streak.streak}
              </span>
              <span style={{ fontSize: 14, color: OF.soft, fontWeight: 500 }}>
                day{streak.streak === 1 ? "" : "s"} in a row
              </span>
              {streak.longest > streak.streak && (
                <span style={{ fontSize: 13, color: OF.faint, fontWeight: 500 }}>
                  best {streak.longest}
                </span>
              )}
            </div>
          )}
        </header>

        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          marginTop: "clamp(16px, 2.4vh, 24px)",
          animation: "rise-blur 0.28s cubic-bezier(0.22,1,0.36,1) 0.1s both",
        }}>
          <button
            onClick={() => onStudy?.(primary.scope)}
            className="btn-press"
            style={{
              background: "#fff", color: "var(--c-accent)", border: "none",
              borderRadius: "var(--r-pill)", padding: "12px 26px",
              fontFamily: "inherit", fontSize: 15.5, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 8px 20px rgba(15,27,61,0.16)",
              display: "flex", alignItems: "center", gap: 7,
            }}
          >
            {primary.label} <span aria-hidden="true">→</span>
          </button>

          {secondary.map(s => (
            <button
              key={s.scope}
              onClick={() => onStudy?.(s.scope)}
              className="btn-press"
              style={{
                background: "rgba(255,255,255,0.12)", color: OF.text,
                border: "none", borderRadius: "var(--r-pill)", padding: "12px 20px",
                fontFamily: "inherit", fontSize: 15, fontWeight: 500, cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      {/* ── Sheet: the bank, and what you've done with it ──────────── */}
      <div style={{ background: "var(--c-card-solid)", flex: 1, paddingBottom: "clamp(24px, 4vh, 48px)" }}>
        <div style={{ ...band, paddingTop: "clamp(14px, 2.4vh, 24px)" }}>
          <div className="dash-split">

            <section style={{ animation: "rise-blur 0.3s cubic-bezier(0.22,1,0.36,1) 0.14s both" }}>
              {/* Position in the bank. Three quantities, one object: mastered
                  sits inside seen sits inside the whole bank, so a stacked bar
                  states the nesting that three separate figures only implied. */}
              <div style={{ marginBottom: "clamp(22px, 3vh, 32px)" }}>
                <div style={{ display: "flex", height: 9, borderRadius: 99, overflow: "hidden", background: "var(--c-surface3)" }}>
                  <div style={{ width: `${(mastered / QUESTIONS.length) * 100}%`, background: "var(--c-accent)" }} />
                  <div style={{ width: `${(Math.max(seen - mastered, 0) / QUESTIONS.length) * 100}%`, background: "var(--c-accent)", opacity: 0.34 }} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 11, fontSize: 13, color: C.sub }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--c-accent)", flexShrink: 0 }} />
                    <strong style={{ color: C.text, fontWeight: 600 }}>{mastered}</strong> mastered
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--c-accent)", opacity: 0.34, flexShrink: 0 }} />
                    <strong style={{ color: C.text, fontWeight: 600 }}>{seen}</strong> seen
                  </span>
                  <span style={{ marginLeft: "auto", color: C.mutedDim }}>{QUESTIONS.length} in the bank</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <h2 style={sectionH}>Where to focus</h2>
                {weakest.length > 0 && (
                  <button
                    onClick={() => setView(V.PROGRESS)}
                    className="btn-press"
                    style={{
                      background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: C.accent,
                    }}
                  >All topics →</button>
                )}
              </div>

              {weakest.length > 0 ? (
                <>
                  <p style={{ ...meta, marginBottom: 14 }}>
                    Your lowest-scoring topics so far. Tap one to drill it.
                  </p>

                  {weakest.map(w => (
                    <button
                      key={w.cat}
                      onClick={() => onStudyTopic?.(w.deck, w.cat)}
                      className="subject-row"
                      title={`Practise ${topicLabel(w.cat, w.deck)}`}
                    >
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <span style={{ display: "block", fontSize: 14.5, fontWeight: 500, color: C.text, letterSpacing: -0.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {topicLabel(w.cat, w.deck)}
                        </span>
                        <span style={{ display: "block", fontSize: 12.5, color: C.mutedDim, marginTop: 1 }}>
                          {w.deck} · {w.total} answered
                        </span>
                      </span>

                      {/* Accent, never red. A wrong-answer list rendered in alarm
                          colours is the thing that makes students protect their
                          percentage instead of attacking their gaps. */}
                      <span style={{ width: "clamp(44px, 6vw, 74px)", height: 4, borderRadius: 99, background: "var(--c-surface3)", overflow: "hidden", flexShrink: 0 }}>
                        <span style={{ display: "block", height: "100%", width: `${w.pct}%`, background: "var(--c-accent)", borderRadius: 99 }} />
                      </span>

                      <span style={{ width: 40, textAlign: "right", fontSize: 13.5, fontWeight: 600, color: C.sub, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {w.pct}%
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <div>
                  <p style={{ ...meta, marginBottom: 14, maxWidth: "44ch" }}>
                    {seen === 0
                      ? "Your lowest-scoring topics will be ranked here, so you always know what to revise next."
                      : `Once a topic has ${MIN_ATTEMPTS} answers behind it, it appears here with your score.`}
                  </p>

                  {/* The real layout, ghosted, so the promise is visible rather
                      than described. aria-hidden and inert: none of it is true. */}
                  <div aria-hidden="true" style={{ opacity: 0.38, pointerEvents: "none", userSelect: "none" }}>
                    {previewRows.map(r => (
                      <div key={r.cat} className="subject-row" style={{ cursor: "default" }}>
                        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 500, color: C.text, letterSpacing: -0.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {topicLabel(r.cat, r.deck)}
                          </span>
                          <span style={{ display: "block", fontSize: 12.5, color: C.mutedDim, marginTop: 1 }}>
                            {r.deck} · {r.total} answered
                          </span>
                        </span>
                        <span style={{ width: "clamp(44px, 6vw, 74px)", height: 4, borderRadius: 99, background: "var(--c-surface3)", overflow: "hidden", flexShrink: 0 }}>
                          <span style={{ display: "block", height: "100%", width: `${r.pct}%`, background: "var(--c-accent)", borderRadius: 99 }} />
                        </span>
                        <span style={{ width: 40, textAlign: "right", fontSize: 13.5, fontWeight: 600, color: C.sub, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {r.pct}%
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                    <button
                      onClick={() => onStudy?.("all")}
                      className="btn-press"
                      style={{
                        background: "transparent", color: C.accent,
                        border: "1px solid var(--c-accent-brd)", borderRadius: "var(--r-pill)",
                        padding: "10px 20px", fontFamily: "inherit", fontSize: 14.5,
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Find my gaps →
                    </button>
                    <span style={{ fontSize: 12.5, color: C.mutedDim }}>Example shown above</span>
                  </div>
                </div>
              )}
            </section>

            <section style={{ animation: "rise-blur 0.3s cubic-bezier(0.22,1,0.36,1) 0.22s both" }}>
              <ActivityHeatmap activity={activity} />

              <div style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                marginTop: 20, paddingTop: 15, borderTop: "1px solid var(--c-border)",
                fontSize: 13.5, color: C.sub,
              }}>
                <span><strong style={{ color: C.text, fontWeight: 600 }}>{totalT.toLocaleString()}</strong> answered</span>
                {acc !== null && <><span aria-hidden="true">·</span><span><strong style={{ color: C.text, fontWeight: 600 }}>{acc}%</strong> accuracy</span></>}
                <span aria-hidden="true">·</span>

                <span>
                  Today {todayCount} of{" "}
                  {editingGoal ? (
                    <form
                      style={{ display: "inline" }}
                      onSubmit={e => {
                        e.preventDefault();
                        const n = parseInt(goalDraft);
                        if (n > 0) onGoalChange?.(n);
                        setEditingGoal(false);
                      }}
                    >
                      <input
                        autoFocus type="number" min="1" max="500"
                        value={goalDraft}
                        onChange={e => setGoalDraft(e.target.value)}
                        onBlur={() => setEditingGoal(false)}
                        style={{
                          width: 50, background: "var(--c-surface3)", border: "1px solid var(--c-border)",
                          borderRadius: 6, outline: "none", fontSize: 13.5, color: C.text,
                          fontFamily: "inherit", textAlign: "center", padding: "1px 0",
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => { setGoalDraft(String(dailyGoal)); setEditingGoal(true); }}
                      style={{
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: C.accent,
                      }}
                    >{dailyGoal}</button>
                  )}
                  {todayCount >= dailyGoal ? " ✓" : ""}
                </span>


                <button
                  onClick={() => setView(V.PROGRESS)}
                  className="btn-press"
                  style={{
                    marginLeft: "auto", background: "none", border: "none", padding: 0,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 13.5,
                    fontWeight: 600, color: C.accent, display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  Progress <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>

          </div>

        </div>
      </div>
    </div>
  );
}
