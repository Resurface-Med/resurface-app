import { useState, useEffect, useRef, useMemo } from "react";
import { C, h1, sectionH, lg, primaryBtn, fieldBtn, fieldGhostBtn, OF, chipBtn, chipBtnActive } from "../ui/theme";
import { shuffle, shuffleOptions } from "../ui/theme";
import { QUESTIONS } from "../data";
import { isReviewDue } from "../lib/sm2";
import Wave from "../ui/Wave";
import QuizShell from "../ui/QuizShell";
import { filteredQuestions, defaultFilter } from "../ui/FilterPanel";
import DeckTree from "../ui/DeckTree";
import { DeckTabs, DeckControls, BankCopier, DeckNameForm } from "../ui/DeckControls";
import DeckBrowser, { DeckPicker } from "../ui/DeckBrowser";
import { buildForest, leavesUnder, findNode, BANK_ROOT } from "../lib/decks";
import { confirmDelete } from "../ui/Confirm";
import SessionSummary from "../ui/SessionSummary";

/** Categories carry their subject as a prefix; the button already names it. */
const COUNT_OPTIONS = [10, 20, 50, "All"];

function shortLabel(cat, deck) {
  return cat && deck && cat.startsWith(`${deck}: `) ? cat.slice(deck.length + 2) : cat;
}

const resumeBtn = { ...fieldBtn, padding: "9px 18px", fontSize: 14 };
const resumeGhostBtn = { ...fieldGhostBtn, padding: "9px 16px", fontSize: 14 };

/** Same measure as the dashboard, so the two screens sit on one grid. */
const band = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 clamp(20px, 3vw, 40px)",
  width: "100%",
};

const SCOPES = [
  { k: "all",   label: "Any" },
  { k: "due",   label: "Due" },
  { k: "wrong", label: "Wrong" },
  { k: "saved", label: "Saved" },
];

/** Where the question came from — orthogonal to Due / Wrong / Saved. */
const BANKS = [
  { k: "both", label: "All questions" },
  { k: "app",  label: "Built-in questions" },
  { k: "mine", label: "Questions you made" },
];

const YEARS = [
  { k: "Year 1", label: "Year 1" },
  { k: "Year 2", label: "Year 2" },
  { k: "Year 3", label: "Year 3" },
  { k: "Year 4", label: "Year 4" },
  { k: "Year 5", label: "Year 5" },
  { k: "All",    label: "All years" },
];

function applyBank(list, bank) {
  if (bank === "app") return list.filter(q => !q.gen);
  if (bank === "mine") return list.filter(q => q.gen);
  return list;
}

/** Anchored menu — native <select> recenters on the chosen row on iOS and
 *  drifts into the status bar when you pick a lower option. */
function SetupMenu({ value, onChange, options, ariaLabel, optionLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = options.find(o => o.k === value) || options[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`setup-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="setup-menu-trigger btn-press"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="setup-menu-trigger-label">{current.label}</span>
        <span className="setup-menu-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="setup-menu-list" role="listbox" aria-label={ariaLabel}>
          {options.map(o => {
            const selected = o.k === value;
            const label = optionLabel ? optionLabel(o) : o.label;
            return (
              <li key={o.k} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`setup-menu-option${selected ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(o.k);
                    setOpen(false);
                  }}
                >
                  <span className="setup-menu-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BankSelect({ value, onChange }) {
  const mineCount = QUESTIONS.filter(q => q.gen).length;
  return (
    <SetupMenu
      value={value}
      onChange={onChange}
      options={BANKS}
      ariaLabel="Whose questions"
      optionLabel={o => (
        o.k === "mine" && mineCount === 0
          ? "Questions you made (none yet)"
          : o.label
      )}
    />
  );
}

function YearSelect({ value, onChange }) {
  return (
    <SetupMenu
      value={value}
      onChange={onChange}
      options={YEARS}
      ariaLabel="Year"
    />
  );
}

/** Compact chips for the setup dock — secondary choices, not a second page. */
/**
 * Whether we are on a phone.
 *
 * The two-step setup is a genuine branch in the flow, not a restyle, so CSS
 * cannot express it — this is the one place a breakpoint has to be known to
 * JavaScript. It listens rather than reading once, so a rotation or a resized
 * window lands on the right shape.
 */
function useIsPhone() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = e => setIsPhone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

/** A toggle that stands on its own needs a resting state you can see. Inside a
 *  segmented track the track is the affordance, so `dockChip` goes transparent
 *  when off — standing alone that reads as a label, not a control. */
function toggleChip(active) {
  return {
    ...chipBtn,
    ...(active ? { ...chipBtnActive, boxShadow: "none" } : {}),
    padding: "7px 12px",
    fontSize: 13,
    whiteSpace: "nowrap",
  };
}

function dockChip(active, disabled) {
  return {
    ...chipBtn,
    ...(active ? {
      ...chipBtnActive,
      boxShadow: "none",
    } : {
      background: "transparent",
      border: "1.5px solid transparent",
      boxShadow: "none",
    }),
    minWidth: "auto",
    padding: "7px 12px",
    fontSize: 13,
    textAlign: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const SESSION_KEY = "pq_practice_session";
function loadSaved() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }

/**
 * What an unfinished session was on, read back out of its own queue.
 *
 * Derived rather than stored, on purpose: sessions saved before this existed
 * carry no label, and the queue has always held each question's deck and cat.
 * Reading it means an old saved session describes itself too, and the shape
 * written to localStorage does not have to change.
 */
function describeSession(s) {
  const qs = s?.queue ?? [];
  if (!qs.length) return null;
  const decks = [...new Set(qs.map(q => q.deck).filter(Boolean))];
  const cats = [...new Set(qs.map(q => q.cat).filter(Boolean))];

  const where = decks.length === 0 ? null
    : decks.length > 1 ? `${decks.length} subjects`
    : cats.length === 1 ? `${decks[0]} · ${shortLabel(cats[0], decks[0])}`
    : `${decks[0]} · ${cats.length} topics`;

  // Answered, not position. The old desktop pill read "3/20 left" off idx + 1,
  // which is where you are rather than what is left — at question 3 of 20 it
  // claimed 3 remained when 17 did.
  const answered = Object.keys(s?.sels ?? {}).length;
  const done = `${answered} of ${qs.length} answered`;
  return where ? `${where} · ${done}` : done;
}

/**
 * The one place questions get answered.
 *
 * Practice, Review, Wrong Answers, Bookmarks and Timed were five destinations
 * for this same screen with a different WHERE clause. They are now scopes,
 * picked here, so the nav describes the task rather than the implementation.
 */
export default function PracticeMode({ pStats, bookmarks, onAnswer, onToggleBookmark, launchFilter, onSessionActive, onRequestExit, srCards = {}, scope: initialScope = "all", decks = [], deckActions = null, openDeckId = null, onOpenDeckConsumed = null, onGenerateInto = null }) {
  const [scope, setScope] = useState(initialScope);
  const [bank, setBank] = useState("both");

  /** Live counts, so a scope with nothing in it says so before you pick it. */
  function scopeCount(k) {
    const pool = applyBank(QUESTIONS, bank);
    if (k === "due")   return pool.filter(q => isReviewDue(srCards[q.id])).length;
    if (k === "saved") return pool.filter(q => bookmarks.includes(q.id)).length;
    if (k === "wrong") return pool.filter(q => {
      const s = pStats[q.id];
      return s && s.total > 0 && s.correct / s.total < 0.6;
    }).length;
    return pool.length;
  }
  /* Arriving from Progress carries a subject and topic by name; the leaves
     those name are looked up once. Everything else starts on All. */
  const [filter, setFilter] = useState(() => {
    if (launchFilter?.leaves) return { ...defaultFilter, year: ["Year 1"], leaves: launchFilter.leaves };
    if (launchFilter?.deck && launchFilter.deck !== "All") {
      const leaves = [...new Set(QUESTIONS
        .filter(q => q.deck === launchFilter.deck && (!launchFilter.cat || launchFilter.cat === "All" || q.cat === launchFilter.cat))
        .map(q => q.leaf))];
      return { ...defaultFilter, year: ["Year 1"], leaves: leaves.length ? leaves : ["All"] };
    }
    return { ...defaultFilter, year: ["Year 1"] };
  });
  const [countOpt, setCountOpt] = useState(20);
  const [topicQuery, setTopicQuery] = useState("");

  /* The tab across the top: null is All, otherwise a root deck's id. A
     tab scopes the tree; the filter's leaves are read inside that scope,
     and "All" inside a tab means all of the tab. */
  const [activeRootId, setActiveRootId] = useState(openDeckId);
  const [creatingDeck, setCreatingDeck] = useState(false);
  /* What is replacing the tree, if anything: a name field (new sub-deck or
     rename, with the deck id it is for), or the bank copier. */
  const [naming, setNaming] = useState(null);      // { mode: "rename" | "sub", deckId }
  const [copyingInto, setCopyingInto] = useState(null); // deck id
  const [browsing, setBrowsing] = useState(null);       // deck id whose questions are listed
  const [movingDeck, setMovingDeck] = useState(null);   // { id, anchor }: the Move into… picker, by its row's button
  const decksById = useMemo(() => new Map(decks.map(d => [d.id, d])), [decks]);
  const activeDeck = activeRootId ? decksById.get(activeRootId) ?? null : null;
  useEffect(() => { if (openDeckId) onOpenDeckConsumed?.(); }, []);
  useEffect(() => {
    setFilter(f => ({ ...f, leaves: ["All"] }));
    setNaming(null);
    setCopyingInto(null);
    setBrowsing(null);
    setTopicQuery("");
  }, [activeRootId]);
  function selectRoot(id) { setCreatingDeck(false); setActiveRootId(id); }
  async function createDeckNamed(name, parentId = null) {
    const d = await deckActions.createDeck(name, parentId);
    setCreatingDeck(false);
    setNaming(null);
    if (!parentId) setActiveRootId(d.id);
  }
  const isPhone = useIsPhone();
  // Phones split the setup in two. A phone screen cannot hold a scrolling list
  // and a full set of controls at once without the controls eating half of it,
  // so the list gets the screen, then the options do.
  const [step, setStep] = useState("topic");
  const [queue, setQueue] = useState(null);
  const [idx, setIdx] = useState(0);
  const [sels, setSels] = useState({});
  const [results, setResults] = useState({});
  const [sC, setSC] = useState(0);
  const [sT, setST] = useState(0);
  const [savedSession, setSavedSession] = useState(loadSaved);
  const [sessionFilter, setSessionFilter] = useState(null);

  // Persist session whenever active state changes
  useEffect(() => {
    if (queue) localStorage.setItem(SESSION_KEY, JSON.stringify({ queue, idx, sels, sC, sT }));
  }, [queue, idx, sels, sC, sT]);

  // Tell App whether we're mid-session (so nav block only fires then)
  useEffect(() => {
    onSessionActive?.(queue !== null);
    return () => onSessionActive?.(false);
  }, [queue]);

  /** The scope is the only thing that separates what used to be five modes. */
  function applyScope(list) {
    if (scope === "due")   return list.filter(q => isReviewDue(srCards[q.id]));
    if (scope === "saved") return list.filter(q => bookmarks.includes(q.id));
    if (scope === "wrong") return list.filter(q => {
      const s = pStats[q.id];
      return s && s.total > 0 && s.correct / s.total < 0.6;
    });
    return list;
  }

  /* Inside a tab, "All" means every leaf under the tab's root. */
  function effective(f) {
    if (!activeRootId || !(f.leaves?.includes("All") || !f.leaves?.length)) return f;
    const forest = buildForest({ questions: QUESTIONS, decks, pStats, eligible: new Set(QUESTIONS.map(q => q.id)), rootId: activeRootId });
    const leaves = forest[0] ? leavesUnder(forest[0]) : [];
    return { ...f, leaves: leaves.length ? leaves : ["nothing"] };
  }

  /** Exactly what a Start press would queue, so the button can say so. */
  function scopedCount(f) {
    return applyScope(applyBank(filteredQuestions(effective(f), pStats), bank)).length;
  }

  function start(filterOverride) {
    const f = effective(filterOverride ?? filter);
    const base = applyScope(applyBank(filteredQuestions(f, pStats), bank));
    if (base.length === 0) return; // nothing matches current filter — stay on setup
    const shuffled = shuffle(base);
    const q = (countOpt === "All" ? shuffled : shuffled.slice(0, Math.min(countOpt, shuffled.length))).map(shuffleOptions);
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
    setSessionFilter(f);
    setQueue(q); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
  }

  function setYear(next) {
    setFilter(f => ({
      ...f,
      year: next === "All" ? ["All"] : [next],
      // Narrower picks were under the old year — drop them so the tree is
      // not left pointing at a deck that year does not have.
      leaves: ["All"],
    }));
  }

  const yearValue = filter.year?.includes("All") || !filter.year?.length
    ? "All"
    : filter.year[0];

  function resumeSession() {
    const s = savedSession;
    const restoredQueue = s.queue ?? [];
    const restoredSels  = s.sels ?? {};
    // Reconstruct results from saved selections so the navigator shows correct/wrong accurately
    const restoredResults = {};
    Object.entries(restoredSels).forEach(([idxStr, sel]) => {
      const i = parseInt(idxStr);
      const q = restoredQueue[i];
      if (q && sel !== undefined) {
        restoredResults[i] = {
          id: q.id, q: q.q, cat: q.cat,
          correct: sel === q.ans,
          correctAnswer: q.opts[q.ans],
          yourAnswer: q.opts[sel],
        };
      }
    });
    setQueue(restoredQueue); setIdx(s.idx ?? 0); setSels(restoredSels);
    setSC(s.sC ?? 0); setST(s.sT ?? 0);
    setResults(restoredResults); setSavedSession(null);
  }

  function discardSession() {
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
  }

  function handleAnswer(i) {
    if (sels[idx] !== undefined || !queue) return;
    const q = queue[idx];
    const correct = i === q.ans;
    setSels(prev => ({ ...prev, [idx]: i }));
    setST(t => t + 1); if (correct) setSC(c => c + 1);
    onAnswer(q.id, correct);
    setResults(prev => ({ ...prev, [idx]: {
      id: q.id, q: q.q, cat: q.cat,
      correct,
      correctAnswer: q.opts[q.ans],
      yourAnswer: q.opts[i],
    }}));
  }

  function handleNext() {
    if (!queue) return;
    if (idx + 1 >= queue.length) {
      localStorage.removeItem(SESSION_KEY);
      setQueue(null); return;
    }
    setIdx(i => i + 1);
  }

  function handleBack() {
    if (idx > 0) setIdx(i => i - 1);
  }

  // Session summary
  if (!queue && Object.keys(results).length > 0) {
    return (
      <SessionSummary
        title={SCOPES.find(s => s.k === scope)?.label ?? "Practice"}
        results={Object.values(results)}
        onRestart={() => {
          const f = sessionFilter ?? filter;
          start(f.unseenOnly ? { ...f, unseenOnly: false } : f);
        }}
        onDrillWrong={(wrongIds) => {
          const qs = QUESTIONS.filter(q => wrongIds.includes(q.id)).map(shuffleOptions);
          if (qs.length === 0) return;
          localStorage.removeItem(SESSION_KEY);
          setQueue(qs); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
        }}
        onChangeSettings={() => setResults({})}
      />
    );
  }

  // Setup screen
  if (!queue) {
    // Scope decides which questions exist at all, so the topic rows can each
    // say how many they would actually give you under it.
    const inScope = applyScope(
      applyBank(QUESTIONS, bank).filter(x => !filter.unseenOnly || !pStats[x.id]),
    );
    const eligibleIds = inScope.map(x => x.id);
    const eligibleSet = new Set(eligibleIds);
    const dueSet = new Set(QUESTIONS.filter(x => isReviewDue(srCards[x.id])).map(x => x.id));
    const fullForest = buildForest({ questions: QUESTIONS, decks, pStats, eligible: eligibleSet, due: dueSet });
    const roots = fullForest;
    const activeRoot = activeRootId ? findNode(fullForest, activeRootId) : null;
    /* Inside a tab, the tree is what is under the root — the tab itself is
       the heading, not a row. */
    const forest = activeRoot ? activeRoot.children : fullForest;
    const bankForest = fullForest.filter(r => r.id === BANK_ROOT);
    const scoped = scopedCount(filter);

    /* What a row's menu offers. Only your decks have one. */
    const rowMenu = node => [
      { label: "Questions", onSelect: n => { setBrowsing(n.id); setTopicQuery(""); } },
      { label: "Rename", onSelect: n => setNaming({ mode: "rename", deckId: n.id }) },
      { label: "Move into…", onSelect: (n, el) => setMovingDeck({ id: n.id, anchor: { current: el } }) },
      { label: "New sub-deck", onSelect: n => setNaming({ mode: "sub", deckId: n.id }) },
      ...(onGenerateInto ? [{ label: "Generate into this", onSelect: n => onGenerateInto(n.id) }] : []),
      { label: "Delete", danger: true, onSelect: async n => {
        if (await confirmDelete(`“${n.name}”`, n.total)) deckActions.deleteDeck(n.id);
      } },
    ];
    async function copyFromBank(leaves) {
      const target = copyingInto;
      setCopyingInto(null);
      if (!target || !leaves?.length) return;
      await deckActions.copyBankTopics(target, leaves.map(id => findNode(bankForest, id)).filter(Boolean));
    }
    const willAsk = countOpt === "All" ? scoped : Math.min(countOpt, scoped);
    /* One topic names itself; several are counted. Spelling out four topic
       names would not fit the button this ends up on, and a list that gets
       truncated tells you less than the number does. */
    const selLeaves = filter.leaves.includes("All") ? [] : filter.leaves;
    const leafName = id => findNode(forest, id)?.name ?? null;
    const topicLabel = selLeaves.length === 1 ? leafName(selLeaves[0])
      : selLeaves.length > 1 ? `${selLeaves.length} decks`
      : activeRoot ? activeRoot.name
      : null;

    // ── Phones: one decision per screen ───────────────────────────
    if (isPhone) {
      return (
        <div className="setup-frame" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <div className="page-band" style={{ ...band, paddingBottom: "clamp(10px, 1.6vh, 16px)", flexShrink: 0 }}>
            {step === "topic" ? (
              <div className="setup-title-row">
                <h1 style={{ ...h1, fontSize: 27, margin: 0 }}>Practice</h1>
                <div className="setup-title-filters">
                  <YearSelect value={yearValue} onChange={setYear} />
                  <BankSelect value={bank} onChange={setBank} />
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-press setup-back"
                  onClick={() => setStep("topic")}
                >
                  <span aria-hidden="true">←</span> {topicLabel ?? "All blocks"}
                </button>
                <h1 style={{ ...h1, fontSize: 27, margin: "10px 0 0" }}>How much?</h1>
              </>
            )}

            {savedSession && step === "topic" && (
              <div className="setup-resume is-stacked">
                <div className="setup-resume-body">
                  <p className="setup-resume-q">Continue this session?</p>
                  <p className="setup-resume-meta">{describeSession(savedSession)}</p>
                </div>
                <div className="setup-resume-acts">
                  <button className="btn-press" style={resumeBtn} onClick={resumeSession}>Continue</button>
                  <button className="btn-press" style={resumeGhostBtn} onClick={discardSession}>Discard</button>
                </div>
              </div>
            )}
          </div>

          <Wave from="transparent" to="var(--c-card-solid)" />

          <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
            <div style={{ ...band, maxWidth: 720, paddingTop: 14, paddingBottom: "calc(24px + var(--safe-b))" }}>

              {step === "topic" ? (
                <>
                  <DeckTabs roots={roots} activeId={activeRootId} onSelect={selectRoot} onNew={() => setCreatingDeck(true)} />
                  {creatingDeck ? (
                    <DeckNameForm onSubmit={n => createDeckNamed(n)} onCancel={() => setCreatingDeck(false)} />
                  ) : naming ? (
                    <DeckNameForm
                      initial={naming.mode === "rename" ? decksById.get(naming.deckId)?.name ?? "" : ""}
                      placeholder={naming.mode === "rename" ? "Name" : "Name the sub-deck"}
                      onCancel={() => setNaming(null)}
                      onSubmit={n => { if (naming.mode === "rename") { deckActions.renameDeck(naming.deckId, n); setNaming(null); } else createDeckNamed(n, naming.deckId); }}
                    />
                  ) : (
                    <>
                      {activeDeck && (
                        <div className="tg-editbar">
                          <span className="tg-editbar-meta">{activeRoot?.total ?? 0} question{(activeRoot?.total ?? 0) === 1 ? "" : "s"}</span>
                          <DeckControls deck={activeDeck} node={activeRoot} actions={deckActions} questionCount={activeRoot?.total ?? 0}
                            onGenerateInto={onGenerateInto} onNewSub={id => setNaming({ mode: "sub", deckId: id })}
                            onCopyFromBank={id => setCopyingInto(id)} onRename={id => setNaming({ mode: "rename", deckId: id })} />
                        </div>
                      )}
                      <input
                        type="search"
                        value={topicQuery}
                        onChange={e => setTopicQuery(e.target.value)}
                        placeholder="Search decks"
                        aria-label="Search decks"
                        className="setup-search"
                      />
                      {browsing ? (
                        <DeckBrowser deckId={browsing} decks={decks} actions={deckActions} query={topicQuery} onDone={() => setBrowsing(null)} />
                      ) : copyingInto ? (
                        <BankCopier bankForest={bankForest} query={topicQuery} onDone={copyFromBank} onCancel={() => setCopyingInto(null)} />
                      ) : activeRoot && activeRoot.total === 0 && !activeRoot.children.length ? (
                        <div className="tg-rows-empty">
                          Nothing here yet. Press <strong>＋ Add</strong> to bring in a lecture, a sub-deck, or topics from ARU Year 1.
                        </div>
                      ) : (
                        <DeckTree
                          key={activeRootId ?? "all"}
                          forest={forest}
                          value={filter}
                          onChange={next => setFilter(f => ({ ...f, ...next }))}
                          query={topicQuery}
                          allLabel={activeRoot ? `All of ${activeRoot.name}` : "Everything"}
                          rowMenu={rowMenu}
                          allowEmpty
                        />
                      )}
                    </>
                  )}
                  {/* Sticky, because the topic list is longer than a phone and
                      the way out should not be at the bottom of a scroll. */}
                  <div className="setup-next-dock">
                    <button
                      className="btn-press"
                      disabled={scoped === 0}
                      onClick={() => { setCountOpt("All"); setStep("options"); }}
                      style={{ ...primaryBtn, ...lg, width: "100%", opacity: scoped === 0 ? 0.5 : 1 }}
                    >
                      {scoped === 0
                        ? "Nothing here — pick another topic"
                        : `Next · ${scoped} question${scoped === 1 ? "" : "s"} →`}
                    </button>
                  </div>
                </>
              ) : (
                <div className="setup-options">
                  <div className="setup-opt-group">
                    <span className="setup-dock-label">From</span>
                    <div className="setup-seg" role="radiogroup" aria-label="Question pool">
                      {SCOPES.map(s => {
                        const n = scopeCount(s.k);
                        const disabled = n === 0 && s.k !== "all";
                        const on = scope === s.k;
                        return (
                          <button key={s.k} role="radio" aria-checked={on} disabled={disabled}
                            className="btn-press" onClick={() => !disabled && setScope(s.k)}
                            style={dockChip(on, disabled)}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="setup-opt-group">
                    <span className="setup-dock-label">How many</span>
                    <div className="setup-seg" role="radiogroup" aria-label="Session length">
                      {COUNT_OPTIONS.map(o => {
                        const disabled = o !== "All" && o > scoped;
                        const on = o === countOpt;
                        return (
                          <button key={o} role="radio" aria-checked={on} disabled={disabled}
                            className="btn-press" onClick={() => !disabled && setCountOpt(o)}
                            style={dockChip(on, disabled)}>
                            {o === "All" ? "All" : o}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="setup-opt-group">
                    <span className="setup-dock-label">Filter</span>
                    <button
                      type="button"
                      className="btn-press"
                      onClick={() => setFilter(f => ({ ...f, unseenOnly: !f.unseenOnly }))}
                      aria-pressed={filter.unseenOnly}
                      style={{ ...toggleChip(filter.unseenOnly), alignSelf: "flex-start" }}
                    >
                      Unseen only
                    </button>
                  </div>

                  <button
                    className="btn-press setup-start"
                    disabled={willAsk === 0}
                    onClick={() => start()}
                    style={{ ...primaryBtn, ...lg, width: "100%", opacity: willAsk === 0 ? 0.5 : 1 }}
                  >
                    {willAsk === 0
                      ? "Nothing here — pick another topic"
                      : `Start · ${willAsk} question${willAsk === 1 ? "" : "s"} →`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      /* Topics own the page. Secondary choices sit in a slim dock so the list
         gets height without a second screen or a tall settings stack. */
      <div className="setup-frame" style={{ display: "flex", flexDirection: "column", height: "var(--screen-h)" }}>
        <div className="page-band" style={{ ...band, paddingTop: "clamp(16px, 2.6vh, 26px)", paddingBottom: "clamp(10px, 1.6vh, 16px)", flexShrink: 0 }}>
          <div className="setup-title-row">
            <h1 data-in="left" style={{ ...h1, fontSize: "clamp(26px, 3vw, 34px)", margin: 0, "--i": 0 }}>Practice</h1>
            <div className="setup-title-filters">
              <YearSelect value={yearValue} onChange={setYear} />
              <BankSelect value={bank} onChange={setBank} />
            </div>
          </div>

          {savedSession && (
            <div className="setup-resume" style={{ marginTop: 14 }}>
              <div className="setup-resume-body">
                <p className="setup-resume-q">Continue this session?</p>
                <p className="setup-resume-meta">{describeSession(savedSession)}</p>
              </div>
              <div className="setup-resume-acts">
                <button className="btn-press" style={resumeBtn} onClick={resumeSession}>Continue</button>
                <button className="btn-press" style={resumeGhostBtn} onClick={discardSession}>Discard</button>
              </div>
            </div>
          )}
        </div>

        <Wave from="transparent" to="var(--c-card-solid)" />

        <div className="setup-sheet" style={{ background: "var(--c-card-solid)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="setup-col" style={{ ...band, flex: 1, minHeight: 0, paddingTop: "clamp(12px, 2vh, 18px)" }}>

            <DeckTabs roots={roots} activeId={activeRootId} onSelect={selectRoot} onNew={() => setCreatingDeck(true)} />
            <div style={{ flexShrink: 0, marginBottom: 8 }}>
              {!creatingDeck && !naming && (
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
                  <h2 style={{ ...sectionH, margin: 0 }}>{copyingInto ? `Copy into ${decksById.get(copyingInto)?.name ?? "deck"}` : browsing ? (decksById.get(browsing)?.name ?? "Questions") : "What are you revising?"}</h2>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 16, fontSize: 13, color: C.muted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {!copyingInto && !browsing && <>{scoped} question{scoped === 1 ? "" : "s"}</>}
                    {activeDeck && !copyingInto && !browsing && (
                      <DeckControls deck={activeDeck} node={activeRoot} actions={deckActions} questionCount={activeRoot?.total ?? 0}
                        onGenerateInto={onGenerateInto} onNewSub={id => setNaming({ mode: "sub", deckId: id })}
                        onCopyFromBank={id => setCopyingInto(id)} onRename={id => setNaming({ mode: "rename", deckId: id })} />
                    )}
                  </span>
                </div>
              )}
              {naming && (
                <DeckNameForm
                  initial={naming.mode === "rename" ? decksById.get(naming.deckId)?.name ?? "" : ""}
                  placeholder={naming.mode === "rename" ? "Name" : `Name the sub-deck of ${decksById.get(naming.deckId)?.name ?? ""}`}
                  onCancel={() => setNaming(null)}
                  onSubmit={n => { if (naming.mode === "rename") { deckActions.renameDeck(naming.deckId, n); setNaming(null); } else createDeckNamed(n, naming.deckId); }}
                />
              )}
              {!creatingDeck && !naming && (
                <input
                  type="search"
                  value={topicQuery}
                  onChange={e => setTopicQuery(e.target.value)}
                  placeholder={browsing ? "Search questions" : "Search decks"}
                  aria-label={browsing ? "Search questions" : "Search decks"}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "11px 16px", fontSize: 14.5, fontFamily: "inherit",
                    color: C.text, background: "var(--c-surface3)",
                    border: "1.5px solid transparent", borderRadius: "var(--r-ctrl)",
                    outline: "none",
                  }}
                />
              )}
            </div>

            {movingDeck && (
              <DeckPicker decks={decks} exclude={movingDeck.id} allowTop anchorRef={movingDeck.anchor} open onClose={() => setMovingDeck(null)}
                current={decksById.get(movingDeck.id)?.parentId ?? null}
                onPick={id => { deckActions.moveDeck(movingDeck.id, id); setMovingDeck(null); }} />
            )}
            <div className="topic-scroll" data-in="rise" style={{ marginTop: 2, "--i": 2 }}>
              {creatingDeck ? (
                <DeckNameForm onSubmit={n => createDeckNamed(n)} onCancel={() => setCreatingDeck(false)} />
              ) : browsing ? (
                <DeckBrowser deckId={browsing} decks={decks} actions={deckActions} query={topicQuery} onDone={() => setBrowsing(null)} />
              ) : copyingInto ? (
                <BankCopier bankForest={bankForest} query={topicQuery} onDone={copyFromBank} onCancel={() => setCopyingInto(null)} />
              ) : activeRoot && activeRoot.total === 0 && !activeRoot.children.length ? (
                <div className="tg-rows-empty">
                  Nothing here yet. Press <strong>＋ Add</strong> to bring in a lecture, a sub-deck, or topics from ARU Year 1.
                </div>
              ) : (
                <DeckTree
                  key={activeRootId ?? "all"}
                  forest={forest}
                  value={filter}
                  onChange={next => setFilter(f => ({ ...f, ...next }))}
                  query={topicQuery}
                  allLabel={activeRoot ? `All of ${activeRoot.name}` : "Everything"}
                  rowMenu={rowMenu}
                  allowEmpty
                />
              )}
            </div>

            <div className="setup-dock" data-in="rise" style={{ "--i": 3 }}>
              <div className="setup-dock-row">
                <div className="setup-dock-group">
                  <span className="setup-dock-label">From</span>
                  <div className="setup-seg setup-seg-dock" role="radiogroup" aria-label="Question pool">
                    {SCOPES.map(s => {
                      const n = scopeCount(s.k);
                      const disabled = n === 0 && s.k !== "all";
                      const active = scope === s.k;
                      return (
                        <button
                          key={s.k}
                          role="radio"
                          aria-checked={active}
                          className="btn-press"
                          disabled={disabled}
                          onClick={() => !disabled && setScope(s.k)}
                          style={dockChip(active, disabled)}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="setup-dock-group">
                  <span className="setup-dock-label">How many</span>
                  <div className="setup-seg setup-seg-dock" role="radiogroup" aria-label="Session length">
                    {COUNT_OPTIONS.map(o => {
                      const disabled = o !== "All" && o > scoped;
                      const active = o === countOpt;
                      return (
                        <button
                          key={o}
                          role="radio"
                          aria-checked={active}
                          disabled={disabled}
                          className="btn-press"
                          style={dockChip(active, disabled)}
                          onClick={() => !disabled && setCountOpt(o)}
                        >
                          {o === "All" ? "All" : o}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="setup-dock-group">
                  <span className="setup-dock-label">Filter</span>
                  <button
                    type="button"
                    className="btn-press"
                    onClick={() => { setFilter(f => ({ ...f, unseenOnly: !f.unseenOnly })); }}
                    aria-pressed={filter.unseenOnly}
                    style={toggleChip(filter.unseenOnly)}
                  >
                    Unseen only
                  </button>
                </div>
              </div>

              <button
                className="btn-press"
                disabled={willAsk === 0}
                onClick={() => start()}
                style={{
                  ...primaryBtn, ...lg, width: "100%",
                  opacity: willAsk === 0 ? 0.5 : 1,
                  cursor: willAsk === 0 ? "not-allowed" : "pointer",
                }}
              >
                {willAsk === 0
                  ? "Nothing left here — try another topic"
                  : `Start · ${willAsk} question${willAsk === 1 ? "" : "s"}${topicLabel ? ` · ${topicLabel}` : ""} →`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const q = queue[idx];
  const sel = sels[idx] ?? null;
  const isBookmarked = bookmarks.includes(q?.id);

  return (
    <QuizShell
      q={q}
      idx={idx}
      queue={queue}
      sel={sel}
      sels={sels}
      results={results}
      isBookmarked={isBookmarked}
      isLast={idx + 1 >= queue.length}
      onAnswer={handleAnswer}
      onNext={handleNext}
      onPrev={idx > 0 ? handleBack : null}
      onJump={setIdx}
      onToggleBookmark={() => onToggleBookmark(q.id)}
      onSaveEdit={(updated) =>
        setQueue((prev) => prev.map((item, i) => (i === idx ? { ...item, ...updated } : item)))
      }
      onRequestExit={onRequestExit}
    />
  );
}
