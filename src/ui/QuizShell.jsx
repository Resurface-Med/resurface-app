import { useEffect, useRef, useState } from "react";

import EditQuestionModal from "./EditQuestionModal";
import ExplainChat from "./ExplainChat";
import Wave from "./Wave";
import QuestionCard from "./QuestionCard";
import QuestionNavigator from "./QuestionNavigator";

/**
 * Full-screen study mode: no sidebar until you ask for the question list.
 */
/** The same chevron the rail and Progress draw, mirrored for back. */
function NavChevron({ back }) {
  return (
    <svg
      width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true"
      style={back ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M6.5 3.5L12 9l-5.5 5.5"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function QuizShell({
  q,
  idx,
  queue,
  sel,
  sels,
  results,
  isBookmarked,
  isLast,
  onAnswer,
  onNext,
  onPrev,
  onJump,
  onToggleBookmark,
  onSaveEdit,
  onRequestExit,
}) {
  const [railOpen, setRailOpen] = useState(false);
  const [railMounted, setRailMounted] = useState(false);
  /* The editor is opened from the header here rather than from the card. The
     card's own tools are suppressed in focus mode, and this needs to be
     reachable before an answer as well as after — a typo in the stem is
     usually the thing you notice first. */
  const [editing, setEditing] = useState(false);

  /* Declared above the effects, because the Escape handler below closes the
     rail and a const arrow referenced before its declaration is a temporal
     dead zone waiting for someone to move an effect. */
  /* Mount and open are two frames, not one.
   *
   * Done together, the browser lays out the whole navigator — one row per
   * question — in the same frame that begins the column transition, and that
   * first frame overruns. The result is a hitch right at the start and then a
   * clean animation, which is exactly what it looked like.
   *
   * So: mount, let a frame pass so the panel is laid out and painted while
   * nothing is moving, then flip the class. Two rAFs because one still lands
   * inside the same style-and-layout pass in Chrome.
   *
   * The ref guards a fast toggle. Without it a click-close during those two
   * frames is overwritten by the queued open, and the rail reopens itself.
   */
  const railWanted = useRef(false);

  function openRail() {
    railWanted.current = true;
    setRailMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (railWanted.current) setRailOpen(true);
    }));
  }
  const closeRail = () => {
    railWanted.current = false;
    setRailOpen(false);
  };

  const [aiOpen, setAiOpen] = useState(false);
  /* Closing is a move, not a disappearance: the dock stays mounted while
     its slot closes, so the question's column widens with it rather than
     jumping the instant the panel unmounts. */
  const [aiMounted, setAiMounted] = useState(false);
  useEffect(() => {
    if (aiOpen) { setAiMounted(true); return; }
    if (!aiMounted) return;
    const t = setTimeout(() => setAiMounted(false), 430);
    return () => clearTimeout(t);
  }, [aiOpen]);

  const [controls, setControls] = useState({
    pending: null,
    answered: false,
    canSubmit: false,
    submit: null,
    next: null,
  });
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!railOpen) return;
    function onKey(e) {
      if (e.key === "Escape") { closeRail(); return; }

      // Not while a modifier is held — those are browser navigation — and not
      // while someone is typing, or asking Resurface AI a question would move
      // the quiz underneath them every time they pressed left.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName || "")) return;

      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && !isLast) { e.preventDefault(); onNext?.(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railOpen, onPrev, onNext, isLast]);

  useEffect(() => {
    setAiOpen(false);
  }, [q?.id]);

  /* The rail has to outlive its own close. Unmounting on the click leaves the
     grid column animating shut around an empty space, which looks like the
     panel was deleted rather than closed — so it stays for the length of the
     transition and goes after.
   *
   * Mounting happens in openRail rather than here. Doing it in an effect would
   * be reacting to a state change the click already knew about, and it costs a
   * render. Only the delayed unmount needs a timer. */
  useEffect(() => {
    if (railOpen) return;
    const t = setTimeout(() => setRailMounted(false), 420);
    return () => clearTimeout(t);
  }, [railOpen]);

  const progress = (idx + 1) / queue.length;
  const answered = Object.keys(sels).length;
  const answeredThis = sel !== null;
  const wrong = answeredThis && sel !== q.ans;
  /* The dock is a window you keep open, not a reaction to being wrong: it
     stays across questions and asks about whichever one is in front of
     you, answered or not — a companion while you think, and a tutor once
     you have committed. Unanswered, it is not sent the correct option, so
     it can teach the ground without handing the answer over. */
  const showAi = aiMounted;
  const aiClosing = aiMounted && !aiOpen;
  const canCheck = !controls.answered && controls.canSubmit;
  const primaryLabel = canCheck
    ? "Check"
    : (isLast ? "Finish" : "Next");

  function handlePrimary() {
    if (canCheck) controls.submit?.();
    else onNext?.();
  }

  return (
    <div className={`quiz-shell${railOpen ? " is-rail" : ""}${showAi ? " is-ai" : ""}`} role="dialog" aria-modal="true" aria-label="Study session">
      <header className="quiz-shell__header">
        <button
          type="button"
          className="quiz-shell__close btn-press"
          onClick={onRequestExit}
          aria-label="Leave session"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="quiz-shell__progress-wrap">
          <div className="quiz-shell__progress" aria-hidden="true">
            <div
              className="quiz-shell__progress-fill"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <span className="quiz-shell__count">
            {idx + 1}/{queue.length}
          </span>

          <button
            type="button"
            className="quiz-shell__tool btn-press"
            onClick={() => setEditing(true)}
            title="Edit question"
            aria-label="Edit question"
          >
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path
                d="M10.5 1.5L13.5 4.5L5 13H2V10L10.5 1.5Z"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* The waterline: the header is a shade of chrome, the question sits
          below it, and the wave is the edge between them.
       *
       * Drawn as a hairline first, and it read as a straight line. Two periods
       * stretched across a wide screen is a wavelength near 1000px against
       * about 12px of amplitude, and a stroke cannot survive that ratio — the
       * landing's wave only reads at similar proportions because it is filled,
       * so the curve is an edge between two tones rather than a line.
       *
       * Still shorter than a section break — 28 to 46 against the landing's 36
       * to 64 — because this is a boundary inside a view rather than the gap
       * between two of them. Height is the only lever for how wavy it looks:
       * the curve's excursion is a proportion of the viewBox, so a taller wave
       * is a deeper one. Changing the path instead would have made every wave
       * in the app deeper, and the others sit where the landing put them. */}
      <Wave
        from="var(--c-bg)"
        to="var(--c-surface2)"
        height="clamp(28px, 3.2vw, 46px)"
      />

      <div className="quiz-shell__stage">
        {railMounted && (
          <aside className="quiz-rail" aria-label="Session progress">
            {/* Fixed-width inner, clipped by the aside. Without it the content
                reflows on every frame as the grid column widens — the title
                and the rows re-wrap the whole way open, which is the thing
                that makes an animated panel look cheap. */}
            <div className="quiz-rail__inner">
            <div className="quiz-rail__head">
              <h2 className="quiz-rail__title">Questions</h2>
              <span className="quiz-rail__count">{answered}/{queue.length}</span>
            </div>
            <div className="quiz-rail__bar" aria-hidden="true">
              <div
                className="quiz-rail__bar-fill"
                style={{ transform: `scaleX(${answered / queue.length})` }}
              />
            </div>
            <QuestionNavigator
              queue={queue}
              idx={idx}
              sels={sels}
              results={results}
              onJump={onJump}
            />
            <button
              type="button"
              className={`quiz-rail__bm btn-press${isBookmarked ? " is-on" : ""}`}
              onClick={onToggleBookmark}
              aria-pressed={isBookmarked}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 2.5h8v12l-4-2.4-4 2.4v-12z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill={isBookmarked ? "currentColor" : "none"}
                />
              </svg>
              {isBookmarked ? "Bookmarked" : "Bookmark"}
            </button>
            </div>
          </aside>
        )}

        {railOpen && (
          <button
            type="button"
            className="quiz-rail__scrim"
            aria-label="Close questions"
            onClick={closeRail}
          />
        )}

        <div ref={bodyRef} className={`quiz-shell__body${showAi ? " has-ai" : ""}`}>
          <div className="quiz-shell__main">
            <QuestionCard
              key={q.id}
              q={q}
              sel={sel}
              onAnswer={onAnswer}
              onNext={onNext}
              onPrev={onPrev}
              onToggleBookmark={onToggleBookmark}
              isBookmarked={isBookmarked}
              isLast={isLast}
              nextLabel="Next question"
              onSaveEdit={onSaveEdit}
              focusMode
              hideActions
              aiOpen={aiOpen}
              onAiOpenChange={setAiOpen}
              onControlsChange={setControls}
            />
          </div>
          {showAi && (
            /* The slot is what moves: it opens from nothing to the dock's
               width and closes back to nothing, so the question's column
               follows it continuously instead of snapping to a new width
               and sliding into place afterwards. The dock inside keeps its
               own width the whole time and is simply revealed, which is
               what stops its text reflowing on every frame. */
            <div className={`ai-slot${aiClosing ? " is-closing" : ""}`}>
              {/* Keyed by the question: the thread is about this one, and
                  moving on starts a fresh one rather than carrying the last
                  question's conversation into it. */}
              <ExplainChat key={q.id} q={q} picked={sel} answered={answeredThis} closing={aiClosing} onClose={() => setAiOpen(false)} />
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditQuestionModal
          q={q}
          onClose={() => setEditing(false)}
          onSave={updated => { setEditing(false); onSaveEdit?.(updated); }}
        />
      )}

      <footer className="quiz-shell__footer">
        <div className="quiz-shell__footer-bar">
          {/* Arrows flank the rail toggle rather than sitting by the primary:
              these three are all "which question am I on", and the button on
              the right is "what do I do with this one". Grouping them says so
              without a label.

              Not a duplicate of that button either. While a question is
              unanswered the primary reads "Check", so forward is the only way
              to skip one — and back had no footer control at all, it meant
              opening the rail. */}
          <div className="quiz-shell__nav">
            <button
              type="button"
              className="quiz-shell__arrow btn-press"
              onClick={() => onPrev?.()}
              disabled={!onPrev}
              aria-label="Previous question"
            >
              <NavChevron back />
            </button>

            <button
              type="button"
              className={`quiz-shell__foot-btn btn-press${railOpen ? " is-on" : ""}`}
              aria-pressed={railOpen}
              onClick={() => (railOpen ? closeRail() : openRail())}
            >
              Questions
            </button>

            <button
              type="button"
              className="quiz-shell__arrow btn-press"
              onClick={() => onNext?.()}
              disabled={isLast}
              aria-label="Next question"
            >
              <NavChevron />
            </button>
          </div>
          {/* The middle of this bar was empty, and the tutor belongs in
              the hand rather than up in the chrome: it is opened between
              reading and answering, which is exactly here. */}
          <div className="quiz-shell__foot-right">
            <button
              type="button"
              className={`quiz-ai-toggle btn-press${aiOpen ? " is-on" : ""}`}
              onClick={() => setAiOpen(o => !o)}
              title={aiOpen ? "Close Resurface AI" : "Open Resurface AI"}
              aria-pressed={aiOpen}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 1.6l1.5 3.6 3.6 1.5-3.6 1.5L8 11.8 6.5 8.2 2.9 6.7l3.6-1.5L8 1.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M12.6 10.6l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span className="quiz-ai-toggle__label">Resurface AI</span>
            </button>

            <button
              type="button"
              className="quiz-shell__foot-btn quiz-shell__foot-btn--primary btn-press"
              onClick={handlePrimary}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
