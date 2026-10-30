import { useEffect, useRef, useState } from "react";
import EditQuestionModal from "./EditQuestionModal";
import { canEdit, persistFor } from "../lib/adminFeatured";
import ExplainChat from "./ExplainChat";
import NoteDock from "./NoteDock";
import { createPortal } from "react-dom";
import { useNotes } from "../lib/notes";
import Wave from "./Wave";
import QuestionCard from "./QuestionCard";
import QuestionNavigator from "./QuestionNavigator";
import LabValues, { BeakerIcon } from "./LabValues";
import { ComboPop, isComboMilestone, COMBO_POP_MS } from "./Nudges";
import SideVideos, { useSideVideos } from "./SubwaySurfers";

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
  peerSplit = null,
  /* The practice session, so Resurface AI counts its replies per sitting. */
  sessionId = null,
}) {
  /* Flags belong to this sitting. They mark a question to come back to,
     and they leave with the session. */
  const [flagged, setFlagged] = useState(() => new Set());
  const flaggedHere = q ? flagged.has(q.id) : false;
  /* The flag marks a question to come back to; it does not report one.
     Students took it for reporting and nothing reached anyone (2026-10-30),
     so the first time it is used it says where reporting is. */
  const [markHint, setMarkHint] = useState(false);
  useEffect(() => {
    if (!markHint) return;
    const t = setTimeout(() => setMarkHint(false), 4000);
    return () => clearTimeout(t);
  }, [markHint]);
  function toggleFlag() {
    if (!q) return;
    if (!flagged.has(q.id)) {
      try {
        if (localStorage.getItem("rs_mark_hint") !== "1") {
          localStorage.setItem("rs_mark_hint", "1");
          setMarkHint(true);
        }
      } catch { /* no storage: no hint */ }
    }
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  }
  const [railOpen, setRailOpen] = useState(false);
  const [railMounted, setRailMounted] = useState(false);
  /* The editor is opened from the header here rather than from the card. The
     card's own tools are suppressed in focus mode, and this needs to be
     reachable before an answer as well as after — a typo in the stem is
     usually the thing you notice first. */
  const [editing, setEditing] = useState(false);
  /* Lab values, slid in from the right (ui/LabValues). */
  const [labsOpen, setLabsOpen] = useState(false);
  const videos = useSideVideos();

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
    const t = setTimeout(() => setAiMounted(false), 530);
    return () => clearTimeout(t);
  }, [aiOpen]);

  /* Your note, beside the question where Resurface AI opens (NoteDock).
     One panel at a time: opening either closes the other. */
  const notesCtx = useNotes();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteMounted, setNoteMounted] = useState(false);
  useEffect(() => {
    if (noteOpen) { setNoteMounted(true); return; }
    if (!noteMounted) return;
    const t = setTimeout(() => setNoteMounted(false), 530);
    return () => clearTimeout(t);
  }, [noteOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [append, setAppend] = useState(null);       // { text, n }: highlighted text on its way to the note
  const openNote = () => { setAiOpen(false); setNoteOpen(true); };
  const closeNote = () => { setNoteOpen(false); setAppend(null); };
  useEffect(() => { if (aiOpen) setNoteOpen(false); }, [aiOpen]);

  /* Text you mark or select after answering gets a small "Add to note"
     beside it. Marks come from the highlighter (QuestionCard), which takes
     the selection for its stroke; a plain selection (the topic note, the
     options' notes) is read here. */
  const [pick, setPick] = useState(null);           // { text, x, y }
  const answeredNow = sel !== null;
  useEffect(() => {
    if (!notesCtx || !answeredNow) return;
    const show = (text, rect) => {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      if (t.length < 2) return;
      setPick({ text: t.slice(0, 1200), x: rect.x, y: rect.y });
    };
    const onMarked = e => show(e.detail?.text, { x: e.detail?.x, y: e.detail?.y });
    let timer = null;
    const fromSelection = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.rangeCount) return;
        const range = s.getRangeAt(0);
        const main = bodyRef.current?.querySelector(".quiz-shell__main");
        if (!main || !main.contains(range.commonAncestorContainer)) return;
        const box = range.getBoundingClientRect();
        show(range.toString(), { x: box.left + box.width / 2, y: box.top });
      }, 250);
    };
    const hide = e => { if (!e.target.closest?.(".note-pick")) setPick(null); };
    window.addEventListener("rs:picked-text", onMarked);
    document.addEventListener("selectionchange", fromSelection);
    document.addEventListener("pointerdown", hide, true);
    const main = bodyRef.current?.querySelector(".quiz-shell__main");
    const onScroll = () => setPick(null);
    main?.addEventListener("scroll", onScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("rs:picked-text", onMarked);
      document.removeEventListener("selectionchange", fromSelection);
      document.removeEventListener("pointerdown", hide, true);
      main?.removeEventListener("scroll", onScroll);
    };
  }, [notesCtx, answeredNow, q?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPick(null); }, [q?.id]);
  function addPicked() {
    if (!pick) return;
    setAppend({ text: pick.text, n: Date.now() });
    openNote();
    setPick(null);
    window.getSelection()?.removeAllRanges();
  }

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

  /*
   * Where you are, not how you are doing.
   *
   * This read cleared/distinct — questions got right out of questions chosen
   * — so answering five and getting two right showed 2/15 while you were
   * looking at the sixth. It is the number in the corner of a quiz; people
   * read it as their position, and it told them their score.
   *
   * It was that way because a missed question is put back into the queue, so
   * a position counter would have had a total that climbed as you worked.
   * Repeating wrong ones is off by default now and opt-in when it is on, so
   * for almost everybody the queue is fixed at the length they asked for —
   * and for the person who turned it on, a total that grows is the truth:
   * there really are more cards to see.
   */
  const total = queue?.length ?? 0;
  const position = Math.min(idx + 1, total);
  /* Questions behind you, so the bar is empty on the first and fills as the
     last one is answered rather than arriving full before it. */
  const progress = total > 0 ? idx / total : 0;
  /* Right answers in a row (2026-10-27): back from the furthest one
     answered, counting until a wrong one. A session only moves forwards,
     so queue order is answer order. Skipped questions don't break it. */
  let run = 0;
  for (const k of Object.keys(results ?? {}).map(Number).sort((a, b) => b - a)) {
    if (!results[k]?.correct) break;
    run++;
  }
  /* Pops when the run climbs onto a milestone — not on opening a session
     that is already on one. */
  const [comboPop, setComboPop] = useState(null);
  const lastRun = useRef(run);
  useEffect(() => {
    if (run > lastRun.current && isComboMilestone(run)) setComboPop({ n: run, at: Date.now() });
    lastRun.current = run;
  }, [run]);
  useEffect(() => {
    if (!comboPop) return;
    const t = setTimeout(() => setComboPop(null), COMBO_POP_MS);
    return () => clearTimeout(t);
  }, [comboPop]);
  const answered = Object.keys(sels).length;
  const answeredThis = sel !== null;
  /* The dock is a window you keep open, not a reaction to being wrong: it
     stays across questions and asks about whichever one is in front of
     you, answered or not — a companion while you think, and a tutor once
     you have committed. Unanswered, it is not sent the correct option, so
     it can teach the ground without handing the answer over. */
  const showAi = aiMounted;
  const aiClosing = aiMounted && !aiOpen;
  const showNote = noteMounted && !showAi;
  const noteClosing = noteMounted && !noteOpen;
  const canCheck = !controls.answered && controls.canSubmit;
  const primaryLabel = canCheck
    ? "Check"
    : (isLast ? "Finish" : "Next");

  function handlePrimary() {
    if (canCheck) controls.submit?.();
    else onNext?.();
  }

  return (
    <div className={`quiz-shell${railOpen ? " is-rail" : ""}${showAi ? " is-ai" : ""}${showNote ? " is-note" : ""}${labsOpen ? " is-labs" : ""}`} role="dialog" aria-modal="true" aria-label="Study session">
      <LabValues open={labsOpen} onClose={() => setLabsOpen(false)} />
      {pick && createPortal(
        <button type="button" className="note-pick btn-press" style={{ left: pick.x, top: pick.y }}
          onPointerDown={e => e.preventDefault()} onClick={addPicked}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Add to note
        </button>,
        document.body,
      )}
      <SideVideos videos={videos} railOpen={railOpen} aiOpen={showAi} />
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
            {position}/{total}
          </span>

          <button
            type="button"
            className={`quiz-shell__tool btn-press${flaggedHere ? " is-on" : ""}`}
            onClick={toggleFlag}
            title={flaggedHere ? "Unmark" : "Mark for later"}
            aria-label={flaggedHere ? "Unmark" : "Mark for later"}
            aria-pressed={flaggedHere}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 3.4v17.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M7 5.2h11.2L14.4 9.6l3.8 4.4H7V5.2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill={flaggedHere ? "currentColor" : "none"} />
            </svg>
          </button>

          <button
            type="button"
            className={`quiz-shell__tool btn-press${labsOpen ? " is-on" : ""}`}
            onClick={() => setLabsOpen(o => !o)}
            title="Lab values"
            aria-label="Lab values"
            aria-expanded={labsOpen}
          >
            <BeakerIcon size={17} />
          </button>

          {/* Premade (featured) questions are not yours to edit — unless you
              are an admin, when the edit goes into the deck itself. */}
          {canEdit(q) && <button
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
          </button>}
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
        height="clamp(16px, min(3.2vw, 4.2vh), 46px)"
      />

      <div className="quiz-shell__stage">
        {comboPop && !showAi && <ComboPop key={comboPop.at} n={comboPop.n} />}
        {markHint && !comboPop && !showAi && (
          <span className="combo mark-hint" role="status">
            <span className="combo__words">Marked for later. To report it, use <strong>Report a problem</strong> under the answer.</span>
          </span>
        )}
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
              flagged={flagged}
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

        <div ref={bodyRef} className={`quiz-shell__body${showAi ? " has-ai" : ""}${aiClosing ? " is-ai-closing" : ""}${showNote ? " has-note" : ""}${noteClosing ? " is-note-closing" : ""}`}>
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
              peerSplit={peerSplit}
              onOpenNote={notesCtx ? openNote : null}
            />
          </div>
          {showNote && (
            <div className={`ai-slot${noteClosing ? " is-closing" : ""}`}>
              <NoteDock q={q} append={append} closing={noteClosing} onClose={closeNote} />
            </div>
          )}
          {showAi && (
            /* The slot is what moves: it opens from nothing to the dock's
               width and closes back to nothing, so the question's column
               follows it continuously instead of snapping to a new width
               and sliding into place afterwards. The dock inside keeps its
               own width the whole time and is simply revealed, which is
               what stops its text reflowing on every frame. */
            <div className={`ai-slot${aiClosing ? " is-closing" : ""}`}>
              {/* Stays mounted across questions. The dock itself notices the
                  move: a new question, a cleared thread, new prompts. */}
              <ExplainChat q={q} picked={sel} answered={answeredThis} closing={aiClosing} sitting={sessionId} onClose={() => setAiOpen(false)} />
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditQuestionModal
          q={q}
          persist={persistFor(q)}
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
          {/* The dock's name, ruled off and set just left of Next. The
              stretch of bar before it stays empty. */}
          <button
            type="button"
            className={`quiz-ai-toggle${aiOpen ? " is-on" : ""}`}
            onClick={() => setAiOpen(o => !o)}
            title={aiOpen ? "Close Resurface AI" : "Open Resurface AI"}
            aria-pressed={aiOpen}
          >
            <span className="quiz-ai-toggle__label">
              <span className="quiz-ai-toggle__name">Resurface</span>
              <span className="quiz-ai-toggle__ai">AI</span>
            </span>
          </button>
          <div className="quiz-shell__foot-right">
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
