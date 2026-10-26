import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import CountField from "../ui/CountField";
import { C, h1, sectionH, lg, primaryBtn, fieldBtn, fieldGhostBtn, OF, chipBtn, chipBtnActive } from "../ui/theme";
import { shuffle, shuffleOptions } from "../ui/theme";
import { QUESTIONS, applyQuestionEdit } from "../data";
import { isReviewDue } from "../lib/sm2";
import { reask, reaskAt, shiftFrom, refreshSaved } from "../lib/session";
import { useAuth } from "../lib/auth";
import Wave from "../ui/Wave";
import QuizShell from "../ui/QuizShell";
import { filteredQuestions, defaultFilter } from "../ui/FilterPanel";
import DeckTree, { prune } from "../ui/DeckTree";
import { DeckControls, DeckNameForm, ShareSheet } from "../ui/DeckControls";
import { buildForest, leavesUnder, findNode, deckShareUrl, walk, shelve, questionsInDeck } from "../lib/decks";
import { confirm } from "../ui/Confirm";
import { isOnline } from "../lib/online";
import { toRecord, fromRecord, sessionLabel, wrongIds } from "../lib/pastSessions";
import { useStudyClock } from "../lib/studyTime";
import { toDeckFile, serializeDeckFile, deckFileName, parseDeckFile, planDeckUpdate } from "../lib/deckFile";
import DeckFileSheet from "../ui/DeckFileSheet";
import PastSessions from "../ui/PastSessions";
import QuestionManager from "../ui/QuestionManager";
import QuestionReviewer from "../ui/QuestionReviewer";
import SuggestPrompt from "../ui/SuggestPrompt";
import { suggestDeck, withdrawSuggestion, fetchMySuggestions, fetchOptionSplit, adminEditFeatured, remote, logStep } from "../lib/remote";
import { splitFor } from "../lib/peerSplit";
import { isFeaturedAdmin, persistFor } from "../lib/adminFeatured";
import SessionSummary from "../ui/SessionSummary";
import ReminderPrompt from "../ui/ReminderPrompt";
import { support as pushSupport } from "../lib/push";

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
/**
 * A labelled checkbox, using the deck tree's own tick.
 *
 * These were pills. A pill is for choosing one of a set — which is what From
 * and How many beside them are doing — and reusing it for an independent
 * on/off says the wrong thing about the control and leaves you reading the
 * fill to work out whether it is on. A box is on or off and says so.
 */
function OptCheck({ on, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onChange}
      className="opt-check"
      title={hint}
    >
      <span className={`topic-check${on ? " is-on" : ""}`} aria-hidden="true">
        {on && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.4L4.6 9 10 3.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="opt-check-label">{label}</span>
    </button>
  );
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

/*
 * An unfinished session, per person.
 *
 * It was one key for the whole browser, so on a shared machine the next
 * person to sign in was offered the last one's session — their questions and
 * their answers. The old key is adopted only when every question in it is
 * one of yours (your own questions' ids are unique to you); otherwise it is
 * someone else's and is thrown away.
 */
const LEGACY_SESSION_KEY = "pq_practice_session";
const sessionKey = userId => `pq_practice_session:${userId}`;
function readJson(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function loadSaved(userId) {
  if (!userId) return null;
  const mine = readJson(sessionKey(userId));
  if (mine) return mine;
  const legacy = readJson(LEGACY_SESSION_KEY);
  try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* storage off */ }
  if (!legacy?.queue?.length) return null;
  const ids = new Set(QUESTIONS.map(q => q.id));
  if (!legacy.queue.every(q => ids.has(q.id))) return null;
  try { localStorage.setItem(sessionKey(userId), JSON.stringify(legacy)); } catch { /* storage off */ }
  return legacy;
}

/**
 * What an unfinished session was on, read back out of its own queue.
 *
 * Derived rather than stored, on purpose: sessions saved before this existed
 * carry no label, and the queue has always held each question's path.
 * Reading it means an old saved session describes itself too, and the shape
 * written to localStorage does not have to change.
 */
function describeSession(s) {
  const qs = s?.queue ?? [];
  if (!qs.length) return null;
  // Answered, not position. The old desktop pill read "3/20 left" off idx + 1,
  // which is where you are rather than what is left — at question 3 of 20 it
  // claimed 3 remained when 17 did.
  const answered = Object.keys(s?.sels ?? {}).length;
  /* Named the way Past sessions names it (lib/pastSessions), from each
     question's path — reading `deck` and `cat` repeated the name. */
  return `${sessionLabel(qs)} · ${answered} of ${qs.length} answered`;
}

/**
 * The one place questions get answered.
 *
 * Practice, Review, Wrong Answers, Bookmarks and Timed were five destinations
 * for this same screen with a different WHERE clause. They are now scopes,
 * picked here, so the nav describes the task rather than the implementation.
 */
/* "Nothing chosen": a leaf id no deck has, so it matches no question and
   ticks no box. Not [] — an empty list has always meant everything. */
const NONE = ["none"];
const isNone = leaves => !leaves?.length || (leaves.length === 1 && leaves[0] === "none");

export default function PracticeMode({ pStats, bookmarks, onAnswer, onToggleBookmark, launchFilter, onSessionActive, onRequestExit, srCards = {}, scope: initialScope = "all", decks = [], deckActions = null, featured = [], featuredDecks = [], onHideFeatured = null, featuredActions = null, openDeckId = null, onOpenDeckConsumed = null, revealDeckId = null, onGenerateInto = null, autoStart = false, onAutoStartConsumed = null, sessions = [], onSessionSave = null, onStudyTime = null }) {
  const [scope, setScope] = useState(initialScope);

  /** Live counts, so a scope with nothing in it says so before you pick it. */
  function scopeCount(k) {
    const pool = QUESTIONS;
    if (k === "due")   return pool.filter(q => isReviewDue(srCards[q.id])).length;
    if (k === "saved") return pool.filter(q => bookmarks.includes(q.id)).length;
    if (k === "wrong") return pool.filter(q => {
      const s = pStats[q.id];
      return s && s.total > 0 && s.correct / s.total < 0.6;
    }).length;
    return pool.length;
  }
  /* Arriving from Progress carries a subject and topic by name; the leaves
     those name are looked up once. Everything else starts with nothing
     chosen (2026-10-18): the list is for picking, and starting on every deck
     ticked meant unticking most of them first. */
  const [filter, setFilter] = useState(() => {
    if (launchFilter?.leaves) return { ...defaultFilter, year: ["Year 1"], leaves: launchFilter.leaves };
    if (launchFilter?.deck && launchFilter.deck !== "All") {
      const leaves = [...new Set(QUESTIONS
        .filter(q => q.deck === launchFilter.deck && (!launchFilter.cat || launchFilter.cat === "All" || q.cat === launchFilter.cat))
        .map(q => q.leaf))];
      return { ...defaultFilter, year: ["Year 1"], leaves: leaves.length ? leaves : ["All"] };
    }
    return { ...defaultFilter, year: ["Year 1"], leaves: NONE };
  });
  const [countOpt, setCountOpt] = useState(20);
  const [topicQuery, setTopicQuery] = useState("");

  /* The tab across the top: null is All, otherwise a root deck's id. A
     tab scopes the tree; the filter's leaves are read inside that scope,
     and "All" inside a tab means all of the tab. */
  const [activeRootId, setActiveRootId] = useState(openDeckId);
  const [creatingDeck, setCreatingDeck] = useState(false);
  /* The deck whose share link is open, or null. One sheet for the screen,
     opened by whichever row's menu asked — it used to live inside
     DeckControls, which only rendered for the active tab's root deck. */
  const [sharing, setSharing] = useState(null);
  /* The deck whose questions are open in the manager (ui/QuestionManager). */
  const [managing, setManaging] = useState(null);
  const [reviewing, setReviewing] = useState(null);           // { id, name }: the reviewer is open
  /* Your folders inside ready-made decks that you suggested for everyone,
     and the one whose suggestion pop-up is open (ui/SuggestPrompt). */
  const [mySuggestions, setMySuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(null);
  const loadSuggestions = () => { if (isOnline()) fetchMySuggestions().then(setMySuggestions, () => {}); };
  useEffect(loadSuggestions, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [shareCopied, setShareCopied] = useState(false);
  /* A deck downloaded for another model to correct, then put back
     (lib/deckFile). The target is which deck the file is being laid onto. */
  const [deckFile, setDeckFile] = useState(null);
  const deckFileRef = useRef(null);
  const deckFileTarget = useRef(null);
  const deckFileBusy = useRef(false);
  async function copyShareLink() {
    if (!sharing) return;
    try {
      await navigator.clipboard.writeText(deckShareUrl(sharing));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { /* the sheet shows the link regardless */ }
  }
  /* What is replacing the tree, if anything: a name field (new sub-deck or
     rename, with the deck id it is for). */
  const [naming, setNaming] = useState(null);      // { mode: "rename" | "sub", deckId }
  /* "We’re adding more topics and years" folds to one line and opens again; which
     way it was left is kept on this device. */
  const [soonHidden, setSoonHidden] = useState(() => {
    try { return localStorage.getItem("other-years-hidden") === "1"; } catch { return false; }
  });
  function toggleSoon() {
    soonFrom.current = soonWrap.current?.offsetHeight ?? null;
    setSoonHidden(h => {
      try { localStorage.setItem("other-years-hidden", h ? "0" : "1"); } catch { /* until reload */ }
      return !h;
    });
  }
  /* The fold, animated (2026-10-18): the space it takes eases between the
     two heights with a little overshoot, and whichever form arrives — the
     card opening, the pill folding — springs in from slightly smaller. */
  const soonWrap = useRef(null);
  const soonFrom = useRef(null);
  useLayoutEffect(() => {
    const wrap = soonWrap.current, from = soonFrom.current;
    soonFrom.current = null;
    if (!wrap || from == null || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const to = wrap.offsetHeight;
    const spring = "cubic-bezier(0.34, 1.32, 0.5, 1)";
    /* Opening overshoots a touch; folding settles without dipping below
       the pill, which would clip its edge — the pill itself does the bounce. */
    wrap.animate([{ height: `${from}px` }, { height: `${to}px` }],
      { duration: 460, easing: soonHidden ? "cubic-bezier(0.22, 1, 0.36, 1)" : spring });
    const el = wrap.firstElementChild;
    el?.animate(
      soonHidden
        ? [{ opacity: 0, transform: "scale(0.82)" }, { opacity: 1, transform: "scale(1)" }]
        : [{ opacity: 0, transform: "scale(0.94) translateY(-6px)" }, { opacity: 1, transform: "none" }],
      { duration: soonHidden ? 420 : 480, easing: spring },
    );
  }, [soonHidden]);
  const decksById = useMemo(() => new Map(decks.map(d => [d.id, d])), [decks]);
  /* Yours and the featured ones, for drawing the list; decksById stays
     yours alone, since everything that reads it renames, shares or deletes. */
  const listDecks = useMemo(() => [...shelve(decks, featuredDecks), ...featuredDecks], [decks, featuredDecks]);
  const activeDeck = activeRootId ? decksById.get(activeRootId) ?? null : null;
  useEffect(() => { if (openDeckId) onOpenDeckConsumed?.(); }, []);

  /*
   * "Start studying" should start studying.
   *
   * It used to land on this screen — tabs, a deck tree, filters and a count
   * — for somebody who had just pressed the one button on the dashboard.
   * The defaults were already right, so it was one more tap to get what the
   * button had promised, and a wall of configuration at the exact moment a
   * new person is deciding whether this is worth their evening.
   *
   * Only when the dashboard said so. Reaching Study from the sidebar is a
   * different intention — that is someone choosing what to revise, and the
   * picker is the point. Consumed immediately, so coming back here later
   * lands where you left off rather than throwing you into a session.
   *
   * If nothing matches, start() returns without doing anything and the
   * picker is still here, which is the right outcome for an empty bank.
   *
   * Layout, not effect: this has to land before the browser paints, or the
   * picker shows for a frame and the question slides in over it — which is
   * the configuration screen flashing up anyway, just faster.
   */
  useLayoutEffect(() => {
    if (!autoStart) return;
    onAutoStartConsumed?.();
    if (autoStart.ids) startWith(autoStart.ids, autoStart.limit);
    else start({ ...filter, leaves: ["All"] });   // "Start studying": everything
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFilter(f => ({ ...f, leaves: NONE }));
    setNaming(null);
    setTopicQuery("");
  }, [activeRootId]);
  const isPhone = useIsPhone();
  /* A new deck is made at once, named "New deck", with its row put straight
     into rename — as Finder does a new folder — rather than a separate field
     above the list (Rafil, 2026-10-17). Cancelling, or leaving it blank,
     takes it away again. */
  /* A new deck needs its id from the server; offline (or if that fails) it
     says so, rather than the button doing nothing. Renaming, moving and
     deleting are queued like answers, so they work offline. */
  async function makeDeck(name, parentId) {
    const offlineMsg = () => confirm({ title: "You’re offline", body: "Making a new deck needs a connection. You can still revise, rename, move and delete decks.", action: "OK", cancel: null });
    if (!isOnline() || navigator.onLine === false) { offlineMsg(); return null; }
    try { return await deckActions.createDeck(name, parentId); }
    catch {
      confirm({ title: "Couldn’t make the deck", body: "Check your connection and try again.", action: "OK", cancel: null });
      return null;
    }
  }
  async function newDeckInline(parentId = null) {
    const d = await makeDeck("New deck", parentId);
    if (!d) return;
    setNaming({ mode: "rename", deckId: d.id, fresh: true });
  }
  function endNaming(id, name) {
    const fresh = Boolean(naming?.fresh);
    if (name) deckActions.renameDeck(id, name, { quiet: fresh });
    else if (fresh) deckActions.deleteDeck(id, { quiet: true });
    setNaming(null);
  }
  async function createDeckNamed(name, parentId = null) {
    if (!await makeDeck(name, parentId)) return;
    setCreatingDeck(false);
    setNaming(null);
    /* A new deck does not become the "active root": that drew its own empty
       state instead of the tree, and with no tabs left on either layout it
       stranded you there. */
  }
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
  /* question id → option_split rows ([] below 10 people). Fetched before the
     answer so the numbers are there when the rows reveal, and not refetched
     after, so they don't jump once your own pick lands. */
  const [peer, setPeer] = useState({});
  const peerRef = useRef({});
  /* Whether the session on screen is someone's first, and the reminder
     offer at its end (ui/ReminderPrompt): once per account on this device,
     and not where notifications can't work at all. */
  const firstSessRef = useRef(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const { user } = useAuth();
  const SESSION_KEY = sessionKey(user?.id);
  const [savedSession, setSavedSession] = useState(() => loadSaved(user?.id));
  const [sessionFilter, setSessionFilter] = useState(null);

  /* Which past session this is (lib/pastSessions): a new id for each new
     session, the same one when it is continued. */
  const sidRef = useRef(null);
  const startedRef = useRef(null);
  function newSid() {
    sidRef.current = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ (Math.random() * 16) >> (c / 4)).toString(16));
    startedRef.current = new Date().toISOString();
  }

  // Persist session whenever active state changes
  useEffect(() => {
    if (queue) localStorage.setItem(SESSION_KEY, JSON.stringify({ queue, idx, sels, sC, sT, sid: sidRef.current, startedAt: startedRef.current }));
  }, [queue, idx, sels, sC, sT, SESSION_KEY]);

  /* Time studied: only while a question is up. The setup screen and the
     summary are not part of it. */
  useStudyClock(queue != null, onStudyTime);

  /* The split for this question and the next. A failed fetch, or one made
     offline, shows nothing, the same as too few answers. */
  useEffect(() => {
    if (!queue?.length || !isOnline()) return;
    const seen = peerRef.current;
    const want = [idx, idx + 1].map(i => queue[i]).filter(q => q && seen[q.id] == null);
    if (!want.length) return;
    let cancel = false;
    for (const item of want) {
      seen[item.id] = "loading";
      const done = rows => {
        if (cancel) return;
        seen[item.id] = rows;
        setPeer(p => ({ ...p, [item.id]: rows }));
      };
      fetchOptionSplit(item.id).then(done, () => done([]));
    }
    return () => {
      cancel = true;
      for (const item of want) if (seen[item.id] === "loading") delete seen[item.id];
    };
  }, [queue, idx]);

  /* Saved to your past sessions as you answer — not on opening one, which
     would move it to the top of the list for being looked at. */
  const loadedSels = useRef(null);
  function saveSession(finished = false) {
    if (!queue || !sidRef.current || !onSessionSave) return;
    if (!finished && Object.keys(sels).length === 0) return;
    onSessionSave(toRecord({ sid: sidRef.current, queue, sels, idx, startedAt: startedRef.current, finished }));
  }
  useEffect(() => {
    if (!queue || sels === loadedSels.current) return;
    saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sels]);

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
    const forest = buildForest({ questions: QUESTIONS, decks: listDecks, pStats, eligible: new Set(QUESTIONS.map(q => q.id)), rootId: activeRootId });
    const leaves = forest[0] ? leavesUnder(forest[0]) : [];
    return { ...f, leaves: leaves.length ? leaves : ["nothing"] };
  }

  /** Exactly what a Start press would queue, so the button can say so. */
  function scopedCount(f) {
    return applyScope(filteredQuestions(effective(f), pStats)).length;
  }


  function start(filterOverride, countOverride) {
    const f = effective(filterOverride ?? filter);
    const base = applyScope(filteredQuestions(f, pStats));
    if (base.length === 0) return; // nothing matches current filter — stay on setup
    const shuffled = shuffle(base);
    const n = countOverride ?? countOpt;
    const q = (n === "All" ? shuffled : shuffled.slice(0, Math.min(n, shuffled.length))).map(shuffleOptions);
    firstSessRef.current = Object.keys(pStats).length === 0;
    if (firstSessRef.current) logStep(user?.id, "first_start");
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
    setSessionFilter(f);
    newSid();
    setQueue(q); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
  }

  /* Someone who has never answered a question: the deck list explains
     itself in one line (2026-10-26). Their first session is the taster from
     the welcome note (ui/TasterPrompt), not anything here. */
  const firstRun = Object.keys(pStats).length === 0;
  function goNext(phone) {
    if (phone) setCountOpt("All");
    setStep("options");
  }

  /*
   * A session on exactly these questions, for the two moments a new person
   * is most likely to start: the questions they just generated, and a deck a
   * friend just sent. Both used to land on the deck list, where they had to
   * find the deck, tick it and press Start — and of the first people with
   * questions and no answers, every one had stopped there.
   */
  function startWith(ids, limit = null) {
    const want = new Set(ids);
    let qs = shuffle(QUESTIONS.filter(q => want.has(q.id)));
    if (!qs.length) return;
    if (limit) qs = qs.slice(0, limit);
    firstSessRef.current = Object.keys(pStats).length === 0;
    if (firstSessRef.current) logStep(user?.id, "first_start");
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
    setSessionFilter(null);
    newSid();
    setQueue(qs.map(shuffleOptions)); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
  }


  function resumeSession() {
    /* Checked against what exists now: questions deleted since are dropped,
       corrected ones come back corrected (see refreshSaved). */
    const fresh = refreshSaved(savedSession, new Map(QUESTIONS.map(q => [q.id, q])), shuffleOptions);
    if (!fresh) { discardSession(); return; }
    const s = { ...savedSession, ...fresh };
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
    if (s.sid) { sidRef.current = s.sid; startedRef.current = s.startedAt ?? new Date().toISOString(); } else newSid();
    loadedSels.current = restoredSels;
    setQueue(restoredQueue); setIdx(s.idx ?? 0); setSels(restoredSels);
    setSC(s.sC ?? 0); setST(s.sT ?? 0);
    setResults(restoredResults); setSavedSession(null);
  }

  /* A past session: carried on from where it was left ("continue", which
     is also how a finished one is looked back through), or the same
     questions again as a new session ("redo"). */
  /* `at`: open on that question (its place in the record) — Review on one
     question in the session's detail. */
  function openPast(rec, how, at = null) {
    setPastOpen(false);
    if (how === "redo") {
      startWith((rec.items ?? []).map(it => it.id));
      return;
    }
    if (how === "wrong") {
      startWith(wrongIds(rec));
      return;
    }
    const got = fromRecord(rec, new Map(QUESTIONS.map(q => [q.id, q])), shuffleOptions);
    if (!got) return;
    const restored = {};
    Object.entries(got.sels).forEach(([i, sel]) => {
      const q = got.queue[i];
      restored[i] = { id: q.id, q: q.q, cat: q.cat, correct: sel === q.ans, correctAnswer: q.opts[q.ans], yourAnswer: q.opts[sel] };
    });
    const answered = Object.values(restored);
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
    setSessionFilter(null);
    sidRef.current = rec.id;
    startedRef.current = rec.created_at ?? new Date().toISOString();
    loadedSels.current = got.sels;
    /* The record's place `at`, as a place in the rebuilt queue: questions
       deleted since drop out, so count the ones still there before it. */
    const live = new Set(got.queue.map(q => q.id));
    const startAt = at == null ? got.idx
      : Math.min(got.queue.length - 1, (rec.items ?? []).slice(0, at).filter(it => live.has(it.id)).length);
    setQueue(got.queue); setIdx(startAt); setSels(got.sels); setResults(restored);
    setSC(answered.filter(r => r.correct).length); setST(answered.length);
  }
  const [pastOpen, setPastOpen] = useState(false);

  /* Past sessions (ui/PastSessions): opened from Study's heading and from
     the end of a session. */
  const liveIds = useMemo(() => new Set(QUESTIONS.map(q => q.id)), [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const pastLink = sessions.length > 0 ? (
    <button type="button" className="gen-link" onClick={() => setPastOpen(true)}>
      Past sessions
    </button>
  ) : null;
  const pastSheet = pastOpen ? (
    <PastSessions sessions={sessions} srCards={srCards} liveIds={liveIds} questions={QUESTIONS}
      onOpen={openPast} onFix={ids => { setPastOpen(false); startWith(ids); }}
      onClose={() => setPastOpen(false)} />
  ) : null;

  /*
   * Space moves on (Rafil, 2026-10-20): on the deck list, with something
   * ticked, it is Next; on the options after it, Start. People press it
   * there by instinct, as they would in Anki.
   *
   * Clicking a deck leaves its checkbox focused, and Space on a focused
   * checkbox would untick it — the opposite of what was meant. So a box
   * focused by a click or tap is overridden; one reached with Tab keeps
   * Space for ticking, as a keyboard user expects. (Not :focus-visible —
   * Chrome turns that on for the very key press being asked about.)
   * Typing, and any open dialog, are left alone.
   */
  const focusByPointer = useRef(true);
  useEffect(() => {
    const pointer = () => { focusByPointer.current = true; };
    const key = e => { if (e.key === "Tab" || e.key.startsWith("Arrow")) focusByPointer.current = false; };
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", pointer, true); window.removeEventListener("keydown", key, true); };
  }, []);
  useEffect(() => {
    if (queue || Object.keys(results).length > 0) return;
    const onKey = e => {
      if (e.key !== " " || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && el.closest?.("input, textarea, select, [contenteditable=true]")) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      if (el && el !== document.body && !focusByPointer.current) return;
      if (step === "topic") {
        if (creatingDeck || naming || isNone(filter.leaves) || scopedCount(filter) === 0) return;
        e.preventDefault();
        el?.blur?.();
        goNext(isPhone);   // as each layout's Next does
      } else if (step === "options") {
        if (scopedCount(filter) === 0) return;
        e.preventDefault();
        el?.blur?.();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function discardSession() {
    localStorage.removeItem(SESSION_KEY); setSavedSession(null);
  }

  function handleAnswer(i) {
    if (sels[idx] !== undefined || !queue) return;
    const q = queue[idx];
    const correct = i === q.ans;
    setSels(prev => ({ ...prev, [idx]: i }));
    setST(t => t + 1); if (correct) setSC(c => c + 1);
    onAnswer(q.id, correct, q.opts[i]);

    /*
     * Got it wrong: it comes back before you leave.
     *
     * The scheduler already intended this — a lapse is given a one-minute
     * step, which is Anki's learning step and exists to bring the card round
     * again in the same sitting. The session could not honour it, because the
     * queue was built once and only ever walked forwards, so "one minute"
     * quietly meant "next time you practise", days later. The single most
     * useful moment in recall — meeting the thing you just missed, while you
     * still remember missing it — was being thrown away.
     *
     * A few questions further on rather than straight after, because
     * immediately is recognition rather than recall: you would still be
     * holding the answer. Far enough to have thought about something else,
     * near enough to be the same sitting.
     *
     * Inserting ahead of where you are is safe even though sels and results
     * are keyed by queue position: a session only moves forwards, so every
     * slot past the current one is empty and shifting them disturbs nothing.
     */
    /* Off unless asked for. A question you have just got wrong coming round
       again is the point of the thing for one person and an interruption for
       another, and the one who finds it an interruption stops using it. Read
       as `=== true` rather than `!== false` so a filter from anywhere that
       predates the field lands on the default rather than against it. */
    setResults(prev => ({ ...prev, [idx]: {
      id: q.id, q: q.q, cat: q.cat,
      correct,
      correctAnswer: q.opts[q.ans],
      yourAnswer: q.opts[i],
    }}));
    if (!correct && filter.retryWrong === true) {
      /* Answers already given past the insertion point — the list lets you
         jump ahead — move with their questions. */
      const at = reaskAt(queue, idx);
      setQueue(prev => reask(prev, idx, q));
      setSels(prev => shiftFrom(prev, at));
      setResults(prev => shiftFrom(prev, at));
    }
  }

  /* Finishing is the moment a blank becomes a wrong answer. Skipping through
     the list does not score anything until then, so a session of nothing but
     skips still has a result to review. */
  async function handleNext() {
    if (!queue) return;
    if (idx + 1 < queue.length) { setIdx(i => i + 1); return; }
    const open = queue
      .map((q, i) => ({ q, i }))
      .filter(({ i }) => sels[i] === undefined);
    if (open.length > 0) {
      const skip = await confirm({
        title: open.length === 1
          ? "You have an unanswered question."
          : `You have ${open.length} unanswered questions.`,
        body: "Skipping them marks each one wrong.",
        action: "Skip them",
        cancel: "Go back",
      });
      if (!skip) return;
      const extra = {};
      for (const { q, i } of open) {
        onAnswer(q.id, false);
        extra[i] = {
          id: q.id, q: q.q, cat: q.cat,
          correct: false,
          correctAnswer: q.opts[q.ans],
        };
      }
      setResults(prev => ({ ...prev, ...extra }));
      setST(t => t + open.length);
    }
    saveSession(true);
    localStorage.removeItem(SESSION_KEY);
    setQueue(null);
  }

  function handleBack() {
    if (idx > 0) setIdx(i => i - 1);
  }

  const summaryUp = !queue && Object.keys(results).length > 0;
  useEffect(() => {
    if (!summaryUp || !firstSessRef.current) return;
    firstSessRef.current = false;
    logStep(user?.id, "first_done");
    const kind = pushSupport();
    if (kind === "none" || kind === "blocked") return;
    const remindKey = `remind-asked:${user?.id ?? ""}`;
    try { if (localStorage.getItem(remindKey)) return; localStorage.setItem(remindKey, "1"); } catch { /* still ask */ }
    setRemindOpen(true);
  }, [summaryUp]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Session summary
  if (!queue && Object.keys(results).length > 0) {
    return (
      <>
      {pastSheet}
      <SessionSummary
        title={scope === "all" ? "Practice" : SCOPES.find(s => s.k === scope)?.label ?? "Practice"}
        results={Object.values(results)}
        onRestart={() => {
          const f = sessionFilter ?? filter;
          start(f.unseenOnly ? { ...f, unseenOnly: false } : f);
        }}
        onDrillWrong={(wrongIds) => {
          const qs = QUESTIONS.filter(q => wrongIds.includes(q.id)).map(shuffleOptions);
          if (qs.length === 0) return;
          localStorage.removeItem(SESSION_KEY);
          newSid();
          setQueue(qs); setIdx(0); setSels({}); setResults({}); setSC(0); setST(0);
        }}
        onChangeSettings={() => { setResults({}); setStep("topic"); setScope("all"); }}
        onOpenPast={onSessionSave ? () => setPastOpen(true) : null}
      />
      {remindOpen && <ReminderPrompt onDone={how => { logStep(user?.id, `remind_${how}`); setRemindOpen(false); }} />}
      </>
    );
  }

  // Setup screen
  if (!queue) {
    // Scope decides which questions exist at all, so the topic rows can each
    // say how many they would actually give you under it.
    const inScope = applyScope(
      QUESTIONS.filter(x => !filter.unseenOnly || !pStats[x.id]),
    );
    const eligibleIds = inScope.map(x => x.id);
    const eligibleSet = new Set(eligibleIds);
    const dueSet = new Set(QUESTIONS.filter(x => isReviewDue(srCards[x.id])).map(x => x.id));
    const fullForest = buildForest({ questions: QUESTIONS, decks: listDecks, pStats, eligible: eligibleSet, due: dueSet });
    for (const s of mySuggestions) {
      const n = findNode(fullForest, s.deckId);
      if (n) n.suggestion = s.waiting > 0 ? "Suggested" : s.added > 0 ? `${s.added} added` : "Reviewed";
    }
    const activeRoot = activeRootId ? findNode(fullForest, activeRootId) : null;
    /* Inside a tab, the tree is what is under the root — the tab itself is
       the heading, not a row. */
    const forest = activeRoot ? activeRoot.children : fullForest;
    const scoped = scopedCount(filter);
    /* Nothing ticked yet (the default), as opposed to ticked decks that
       happen to hold nothing for this scope. The heading counts what there
       is to choose from until something is chosen. */
    const nothingChosen = isNone(filter.leaves);
    const poolSize = scopedCount({ ...filter, leaves: ["All"] });

    /* An account with nothing to practise. This screen used to give it the
       whole machine anyway — a search box with nothing to search, a dashed
       "No decks yet" box, From / How many / Options, and a disabled "Nothing
       left here — try another topic". With no questions it says so once and
       offers the one thing that fixes it; with no decks either, that is all
       it shows. Decks that exist but are empty stay listed, to organise. */
    const noQuestions = QUESTIONS.length === 0;
    const blank = noQuestions && fullForest.length === 0;
    /* Progress's empty state, not a new one (StatsView Blank): a small
       centred title, one muted line, one small button, the same words. */
    const renderEmpty = () => (
      <div className="prog-blank">
        <div className="prog-blank-inner">
          <h2 className="prog-blank-title">Nothing to practise yet</h2>
          <p className="prog-blank-body">Add a lecture and your questions will show up here.</p>
          <button type="button" className="prog-blank-cta btn-press" onClick={() => onGenerateInto?.(null)}>
            Add material
          </button>
        </div>
      </div>
    );
    /* A rename happens in the deck's own row when that row is on screen. The
       form at the top is left for what has no row — on phones, the open
       tab's own deck. */
    const inlineRename = naming?.mode === "rename" && Boolean(findNode(forest, naming.deckId));
    const renameProps = {
      renamingId: inlineRename ? naming.deckId : null,
      onRename: endNaming,
    };

    /* What a row's menu offers: your decks the lot. A ready-made folder can
       be hidden. An admin also manages questions on every deck inside it —
       the byline, and so the hide, live only on the folder. */
    /* Rows carry the id drawn at the top (a folder, perhaps); hiding is
       keyed on the real deck. */
    const hideFeatured = topId => {
      if (activeRootId === topId) setActiveRootId(null);
      const r = featured.find(x => (x.top ?? x.id) === topId);
      if (r) onHideFeatured?.(r.id, true);
    };
    /* A deck as a file (lib/deckFile): an admin downloads it, lets something
       correct the questions, and uploads that same file back onto this deck. */
    function downloadDeck(node) {
      if (!isFeaturedAdmin()) return;
      const file = toDeckFile(node.name, questionsInDeck(node.id), node.id);
      const url = URL.createObjectURL(new Blob([serializeDeckFile(file)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = deckFileName(node.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    function openDeckFile(node) {
      if (!isFeaturedAdmin()) return;
      deckFileTarget.current = { id: node.id, name: node.name };
      if (deckFileRef.current) { deckFileRef.current.value = ""; deckFileRef.current.click(); }
    }
    async function onDeckFile(e) {
      const chosen = e.target.files?.[0];
      const target = deckFileTarget.current;
      e.target.value = "";
      if (!isFeaturedAdmin() || !chosen || !target) return;
      let text;
      try { text = await chosen.text(); }
      catch { setDeckFile({ deckName: target.name, error: "That file couldn't be read." }); return; }
      const parsed = parseDeckFile(text);
      if (parsed.error) { setDeckFile({ deckName: target.name, error: parsed.error }); return; }
      setDeckFile({ deckName: target.name, plan: planDeckUpdate(parsed, questionsInDeck(target.id)) });
    }
    async function applyDeckCorrections() {
      const plan = deckFile?.plan;
      if (!isFeaturedAdmin() || !plan?.updates.length || !user || deckFileBusy.current) return;
      deckFileBusy.current = true;
      setDeckFile(d => ({ ...d, busy: true }));
      const pending = [...plan.updates];
      let failed = 0;
      async function one() {
        for (;;) {
          const u = pending.shift();
          if (!u) return;
          try {
            if (u.featured) await adminEditFeatured(u.id, u.payload);
            else {
              await remote.updateGenerated(user.id, { id: u.id, ...u.payload });
              await remote.questionEdit(user.id, u.id, u.payload);
            }
            applyQuestionEdit(u.id, u.payload);
          } catch { failed += 1; }
        }
      }
      await Promise.all([one(), one(), one(), one(), one(), one()]);
      deckFileBusy.current = false;
      setDeckFile(d => (d ? { ...d, busy: false, done: true, failed } : d));
    }
    function fileItems(node) {
      if (!isFeaturedAdmin() || !questionsInDeck(node.id).length) return [];
      return [
        { label: "Download deck", onSelect: downloadDeck },
        { label: "Upload corrections", onSelect: openDeckFile },
      ];
    }
    /* Review questions (2026-10-23): the admin team's reviewer, on any deck. */
    const reviewItem = isFeaturedAdmin()
      ? [{ label: "Review questions", onSelect: n => setReviewing({ id: n.id, name: n.name }) }]
      : [];
    const manageFeatured = isFeaturedAdmin() && featuredActions
      ? [{ label: "Manage questions", onSelect: n => setManaging(n.id) }, ...reviewItem]
      : [];
    const featuredMenu = node => [
      ...manageFeatured,
      ...fileItems(node),
      { label: "Hide from my decks", onSelect: n => hideFeatured(n.id) },
    ];
    const rowMenu = node => node.mine ? [
      { label: "Manage questions", onSelect: n => setManaging(n.id) },
      ...reviewItem,
      { label: "Rename", onSelect: n => setNaming({ mode: "rename", deckId: n.id }) },
      { label: "New sub-deck", onSelect: n => newDeckInline(n.id) },
      ...(onGenerateInto ? [{ label: "Generate into this", onSelect: n => onGenerateInto(n.id) }] : []),
      /* Share is here rather than only on a root deck's tab, which is where
         it used to live and why fourteen shareable decks had been shared
         exactly zero times. */
      { label: "Share", onSelect: n => { const d = decksById.get(n.id); if (d) setSharing(d); } },
      ...fileItems(node),
      /* A folder of yours inside a ready-made deck can go to the reviewers,
         to be added for everyone. */
      /* Not one filed under a heading ("Year 2"): there is no deck to add to. */
      ...(node.yours && !node.shelved ? [{ label: mySuggestions.some(s => s.deckId === node.id) ? "Your suggestion" : "Suggest for everyone", onSelect: n => setSuggesting(n.id) }] : []),
      /* No "are you sure": the undo that follows is the safety net. */
      { label: "Delete", danger: true, onSelect: n => deckActions.deleteDeck(n.id) },
    ] : node.byline && onHideFeatured ? featuredMenu(node)
      : node.featured && (manageFeatured.length || fileItems(node).length) ? [...manageFeatured, ...fileItems(node)]
      : null;
    const qNorm = topicQuery.trim().toLowerCase();
    /* A featured deck you hid can be brought back. (An old copy of one is
       swapped for it automatically — see App's switchToFeatured.) */
    const hiddenFeatured = featured.filter(r => r.hidden);
    const hiddenNotes = hiddenFeatured.length > 0 && !qNorm ? (
      <>
        {hiddenFeatured.map(r => (
          <p key={r.id} className="feat-hidden">
            {r.byline}’s {r.name} deck is hidden.{" "}
            <button type="button" className="gen-link" onClick={() => onHideFeatured?.(r.id, false)}>Show it</button>
          </p>
        ))}
      </>
    ) : null;
    /*
     * The list: your decks, then the featured ones in a tree of their own.
     *
     * Two trees rather than one so that nothing about moving decks can reach
     * a deck that is not yours — dragging, Alt+arrows and Move to… all work
     * within the tree they start in. Choosing is shared: both read and write
     * the same selection, and "Everything" (in whichever tree comes first)
     * counts both. Inside a tab there is only that deck, so one tree.
     */
    const ownRoots = forest.filter(n => !n.featured);
    const featRoots = activeRoot ? [] : forest.filter(n => n.featured);
    const featMatch = !qNorm || prune(featRoots, qNorm).length > 0;
    const allCount = forest.reduce((n, r) => n + r.avail, 0);
    /* Only one year is covered so far. Said where the decks are — just
       above their heading, so it reads as about them (2026-10-20) — with the way
       round it, so nobody in another year thinks the app is not for them. */
    const soonNote = !qNorm ? <div className="feat-soon-wrap" ref={soonWrap}>{soonHidden ? (
              <button type="button" className="feat-soon-line btn-press" onClick={toggleSoon} aria-expanded="false">
                <img src="/icon-192.png" alt="" aria-hidden="true" width="22" height="22" />
                <span>We’re working hard to add more topics and years</span>
                <svg className="feat-soon-chev" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : (
              <section className="feat-soon" aria-label="Other years">
                <button type="button" className="feat-soon__x" onClick={toggleSoon} aria-expanded="true" aria-label="Fold this message away">
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <img src="/icon-192.png" alt="" aria-hidden="true" className="feat-soon__mark" width="44" height="44" />
                <div className="feat-soon__text">
                  <h3 className="feat-soon__title">We’re working hard to add more topics and years</h3>
                  <p className="feat-soon__body">
                    Year 1 has Principles and Respiratory, and Year 2 has Renal and Endocrine.
                    We’re adding the next blocks as the year goes on, and working on the other
                    years. In the meantime, you can make questions from your own Anki decks,
                    lecture slides, PDFs or notes.
                  </p>
                </div>
                {onGenerateInto && (
                  <button type="button" className="feat-soon__go btn-press" onClick={() => onGenerateInto(null)}>
                    Make my own questions <span aria-hidden="true">→</span>
                  </button>
                )}
              </section>
            )}</div> : null;
    /* Yours and the ready-made decks in one tree, the second under its own
       heading: one tree so a folder of yours can be dragged into a
       ready-made deck (Rafil, 2026-10-23). It was two, to keep drags off
       decks that are not yours; that now rests on rows only being draggable
       when they are yours (n.mine), and App's moveDeck refusing anything
       that is not a deck you may put things in. */
    const both = ownRoots.length > 0 && featRoots.length > 0;
    const deckList = ({ key, ...rest }) => {
      const treeProps = { ...rest, revealId: revealDeckId };
      return (
      <>
        {both ? (
          <DeckTree key={key} {...treeProps} forest={[...ownRoots, ...featRoots]}
            allAvail={allCount} heading="Your decks"
            sectionBefore={{
              ids: new Set(featRoots.map(n => n.id)),
              content: <div key="__feat" className="feat-tree">{soonNote}<h3 className="deck-section-h">Ready-made decks</h3></div>,
            }} />
        ) : (ownRoots.length > 0 || featRoots.length === 0) ? (
          <DeckTree key={key} {...treeProps} forest={activeRoot ? forest : ownRoots}
            allAvail={activeRoot ? treeProps.allAvail : allCount}
            heading={null} />
        ) : featMatch && (
          <DeckTree key="featured" forest={featRoots} value={filter}
            onChange={next => setFilter(f => ({ ...f, ...next }))}
            query={topicQuery} allLabel="Everything" allAvail={allCount}
            /* With no decks of their own, the heading comes from the tree
               itself, under Everything, as "Your decks" does — so a new
               account can see what these are (Rafil, 2026-10-20). */
            heading="Ready-made decks" intro={soonNote}
            rowMenu={rowMenu} allowEmpty revealId={revealDeckId} />
        )}
        {hiddenNotes}
      </>
      );
    };
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

    /* The session's settings: their own step on every screen size. On the
       desktop they used to sit in a dock under the deck list, a third of the
       screen spent on choices made once and rarely changed, in the way of
       just browsing decks. Now the list has the page and "Next" leads here. */
    const optionsPanel = (
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

          {/* A slider, as in Generate: one control for one number, with the
              pool's size as the end of the track, so a short deck never
              offers a length it cannot fill. The far end is "All", and stays
              all when the pool changes under it. */}
          <div className="gen-count setup-count">
            <div className="gen-count-head">
              <span className="setup-dock-label">How many</span>
              <CountField value={willAsk} max={scoped}
                onCommit={v => setCountOpt(v >= scoped ? "All" : v)} />
            </div>
            <input
              id="setup-count"
              className="gen-count-slider"
              type="range"
              min={1}
              max={Math.max(1, scoped)}
              step={1}
              value={Math.max(1, willAsk)}
              disabled={scoped === 0}
              onChange={e => { const v = Number(e.target.value); setCountOpt(v >= scoped ? "All" : v); }}
              aria-label="How many questions"
              aria-valuetext={`${willAsk} question${willAsk === 1 ? "" : "s"}`}
            />
            <div className="gen-count-ends" aria-hidden="true">
              <span>1</span>
              <span>{scoped}</span>
            </div>
          </div>

          <div className="setup-opt-group">
            <span className="setup-dock-label">Options</span>
            <div className="setup-opt-checks">
              <OptCheck
                on={filter.unseenOnly}
                onChange={() => setFilter(f => ({ ...f, unseenOnly: !f.unseenOnly }))}
                label="Unseen only"
                hint="Leave out questions you have already answered"
              />
              <OptCheck
                on={filter.retryWrong === true}
                onChange={() => setFilter(f => ({ ...f, retryWrong: f.retryWrong !== true }))}
                label="Repeat wrong"
                hint="Ask a question again later in the session if you get it wrong"
              />
            </div>
          </div>

          <button
            className="btn-press setup-start"
            disabled={willAsk === 0}
            onClick={() => start()}
            style={{ ...primaryBtn, ...lg, width: "100%", opacity: willAsk === 0 ? 0.5 : 1 }}
          >
            {willAsk === 0
              ? "Nothing here — go back and pick another deck"
              : `Start · ${willAsk} question${willAsk === 1 ? "" : "s"} →`}
          </button>
        </div>
    );

    /* Drawn by both layouts. It was only in the desktop one, so on a phone
       Share set the deck and nothing appeared. */
    /* Every deck under the one being reviewed: a suggestion for any of them
       shows in its Suggested tab. */
    const reviewIds = reviewing ? new Set(walk(findNode(fullForest, reviewing.id) ?? { id: reviewing.id, children: [] }).map(n => n.id)) : null;
    const reviewer = reviewing && (
      featuredDecks.some(d => d.id === reviewing.id)
        ? <QuestionReviewer deckId={reviewing.id} deckName={reviewing.name} actions={featuredActions} deckIds={reviewIds}
            editPersist={(updated, q) => persistFor(q)?.(updated)} onClose={() => setReviewing(null)} />
        : <QuestionReviewer deckId={reviewing.id} deckName={reviewing.name} actions={deckActions} deckIds={reviewIds} onClose={() => setReviewing(null)} />
    );
    const suggestPrompt = suggesting && (() => {
      const host = featuredDecks.find(d => d.id === decksById.get(suggesting)?.parentId);
      const sug = mySuggestions.find(s => s.deckId === suggesting) ?? null;
      return (
        <SuggestPrompt
          folderName={decksById.get(suggesting)?.name ?? "This folder"}
          deckName={host?.name ?? "this deck"}
          owner={featured.find(r => r.id === host?.root)?.byline ?? null}
          count={QUESTIONS.filter(x => x.gen && x.path?.some(p => p.id === suggesting)).length}
          status={sug}
          onSend={async note => { await suggestDeck(suggesting, note); loadSuggestions(); }}
          onWithdraw={async () => { await withdrawSuggestion(suggesting); loadSuggestions(); }}
          onClose={() => setSuggesting(null)}
        />
      );
    })();
    const manager = managing && (
      featuredDecks.some(d => d.id === managing)
        ? <QuestionManager deckId={managing} decks={listDecks} pStats={pStats} actions={featuredActions}
            editPersist={(updated, q) => persistFor(q)?.(updated)} onClose={() => setManaging(null)} />
        : <QuestionManager deckId={managing} decks={decks} pStats={pStats} actions={deckActions} onClose={() => setManaging(null)} />
    );
    /* The deck list counted only Due questions after Home's "Review" with
       nothing on screen saying so — Jacob's deck read 11 questions (Rafil,
       2026-10-20). Whenever the list is narrowed, it says so here, with
       the way back to everything. */
    const scopeNote = scope !== "all" ? (
      <button type="button" className="gen-link" onClick={() => setScope("all")}>
        {({ due: "Due", wrong: "Wrong", saved: "Saved" })[scope] ?? scope} only · show all
      </button>
    ) : null;
    const deckFileSheet = (
      <>
        <input ref={deckFileRef} type="file" accept=".json,.txt,application/json,text/plain" style={{ display: "none" }} onChange={onDeckFile} />
        {deckFile && (
          <DeckFileSheet
            deckName={deckFile.deckName}
            plan={deckFile.plan}
            error={deckFile.error}
            busy={Boolean(deckFile.busy)}
            done={Boolean(deckFile.done)}
            failed={deckFile.failed || 0}
            onApply={applyDeckCorrections}
            onClose={() => { if (!deckFile.busy) setDeckFile(null); }}
          />
        )}
      </>
    );
    const shareSheet = sharing && (
      <ShareSheet
        deck={sharing}
        url={deckShareUrl(sharing)}
        copied={shareCopied}
        onCopy={copyShareLink}
        onClose={() => { setSharing(null); setShareCopied(false); }}
      />
    );

    // ── Phones: one decision per screen ───────────────────────────
    if (isPhone) {
      return (
        <div className="setup-frame" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <div className="page-band" style={{ ...band, paddingBottom: "clamp(10px, 1.6vh, 16px)", flexShrink: 0 }}>
            {step === "topic" ? (
              <div className="setup-title-row">
                <h1 style={{ ...h1, fontSize: 27, margin: 0 }}>Practice</h1>
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
                  {/* The same heading as desktop, not a row of deck pills:
                      the tree below already lists every deck. */}
                  {!blank && !creatingDeck && (!naming || inlineRename) && (
                    <div className="setup-head">
                      <h2 style={{ ...sectionH, margin: 0 }}>What are you revising?</h2>
                      <span className="setup-head__meta">
                        <span>{nothingChosen ? poolSize : scoped} question{(nothingChosen ? poolSize : scoped) === 1 ? "" : "s"}</span>
                        {activeRoot
                          ? <button type="button" className="gen-link" onClick={() => setActiveRootId(null)}>← All decks</button>
                          : <button type="button" className="gen-link" onClick={() => newDeckInline(null)}>＋ New deck</button>}
                        {pastLink}
                        {scopeNote}
                      </span>
                    </div>
                  )}
                  {firstRun && !noQuestions && !creatingDeck && (
                    <p className="setup-hint">Tick the topics you've covered, then press Next.</p>
                  )}
                  {creatingDeck ? (
                    <DeckNameForm onSubmit={n => createDeckNamed(n)} onCancel={() => setCreatingDeck(false)} />
                  ) : naming && !inlineRename ? (
                    <DeckNameForm
                      initial={naming.mode === "rename" ? decksById.get(naming.deckId)?.name ?? "" : ""}
                      placeholder={naming.mode === "rename" ? "Name" : "Name the sub-deck"}
                      onCancel={() => endNaming(naming.deckId, null)}
                      onSubmit={n => { if (naming.mode === "rename") endNaming(naming.deckId, n); else createDeckNamed(n, naming.deckId); }}
                    />
                  ) : blank ? renderEmpty() : (
                    <>
                      {noQuestions && renderEmpty()}
                      {activeDeck && (
                        <div className="tg-editbar">
                          <span className="tg-editbar-meta">{activeRoot?.total ?? 0} question{(activeRoot?.total ?? 0) === 1 ? "" : "s"}</span>
                          <DeckControls deck={activeDeck} node={activeRoot} actions={deckActions} onManage={id => setManaging(id)} questionCount={activeRoot?.total ?? 0}
                            onGenerateInto={onGenerateInto} onNewSub={id => setNaming({ mode: "sub", deckId: id })}
                            onRename={id => setNaming({ mode: "rename", deckId: id })} />
                        </div>
                      )}
                      {activeRoot?.featured && (
                        <div className="tg-editbar">
                          <span className="tg-editbar-meta">{activeRoot.total} question{activeRoot.total === 1 ? "" : "s"} · by {activeRoot.byline}</span>
                          <button type="button" className="gen-link" onClick={() => hideFeatured(activeRoot.id)}>Hide</button>
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
                      {activeRoot && activeRoot.total === 0 && !activeRoot.children.length ? (
                        <div className="tg-rows-empty">
                          Nothing here yet. Press <strong>＋ Add</strong> to turn a lecture into questions, or to make a sub-deck.
                        </div>
                      ) : (
                        deckList({
                          key: activeRootId ?? "all",
                          value: filter,
                          onChange: next => setFilter(f => ({ ...f, ...next })),
                          query: topicQuery,
                          allLabel: "Everything",
                          allAvail: null,
                          rowMenu,
                          /* Inside a tab the tree is that deck's children, so
                             its top level is the tab's deck, and Move to…
                             needs the whole tree to reach the other tabs. */
                          onMove: (id, parentId, beforeId) => deckActions.moveDeck(id, parentId, beforeId),
                          allForest: fullForest,
                          rootParentId: activeRoot ? activeRootId : null,
                          ...renameProps,
                          allowEmpty: true,
                        })
                      )}
                    </>
                  )}
                  {/* Sticky, because the topic list is longer than a phone and
                      the way out should not be at the bottom of a scroll. */}
                  <div className={`setup-next-dock${noQuestions ? " is-hidden" : ""}${nothingChosen ? " is-away" : ""}`} aria-hidden={nothingChosen || undefined}>
                    <button
                      className="btn-press"
                      disabled={scoped === 0}
                      onClick={() => goNext(true)}
                      style={{ ...primaryBtn, ...lg, width: "100%", opacity: scoped === 0 ? 0.5 : 1 }}
                    >
                      {scoped === 0
                        ? nothingChosen ? "Choose what to revise" : "Nothing here — pick another deck"
                        : `Next · ${scoped} question${scoped === 1 ? "" : "s"} →`}
                    </button>
                  </div>
                </>
              ) : optionsPanel}
            </div>
          </div>
          {shareSheet}
          {deckFileSheet}
          {pastSheet}
          {manager}
          {reviewer}
          {suggestPrompt}
        </div>
      );
    }

    return (
      /* Topics own the page. Secondary choices sit in a slim dock so the list
         gets height without a second screen or a tall settings stack. */
      <div className="setup-frame" style={{ display: "flex", flexDirection: "column", height: "var(--screen-h)" }}>
        <div className="page-band" style={{ ...band, paddingTop: "clamp(16px, 2.6vh, 26px)", paddingBottom: "clamp(10px, 1.6vh, 16px)", flexShrink: 0 }}>
          {step === "topic" ? (
            <div className="setup-title-row">
              <h1 data-in="left" style={{ ...h1, fontSize: "clamp(26px, 3vw, 34px)", margin: 0, "--i": 0 }}>Practice</h1>
            </div>
          ) : (
            <>
              <button type="button" className="btn-press setup-back" onClick={() => setStep("topic")}>
                <span aria-hidden="true">←</span> {topicLabel ?? "All decks"}
              </button>
              <h1 data-in="left" style={{ ...h1, fontSize: "clamp(26px, 3vw, 34px)", margin: "10px 0 0", "--i": 0 }}>How much?</h1>
            </>
          )}

          {savedSession && step === "topic" && (
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
          <div className="setup-col" style={{
            ...band,
            width: "min(100%, 1040px)",
            maxWidth: 1040,
            marginLeft: "auto",
            marginRight: "auto",
            flex: 1,
            minHeight: 0,
            paddingTop: "clamp(12px, 2vh, 18px)",
          }}>

            {step === "options" ? (
              <div className="setup-options-page" data-in="rise" style={{ "--i": 1 }}>
                {optionsPanel}
              </div>
            ) : (
            <>
            <div style={{ flexShrink: 0, marginBottom: 8 }}>
              {!blank && !creatingDeck && (!naming || inlineRename) && (
                <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "6px 14px", marginBottom: 10 }}>
                  <h2 style={{ ...sectionH, margin: 0 }}>What are you revising?</h2>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 13, color: C.muted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    <>{nothingChosen ? poolSize : scoped} question{(nothingChosen ? poolSize : scoped) === 1 ? "" : "s"}</>
                    {/* Landed inside one deck (from a share link or Generate):
                        the way back to the whole list. */}
                    {activeRoot ? (
                      <button type="button" className="gen-link" onClick={() => setActiveRootId(null)}>
                        ← All decks
                      </button>
                    ) : (
                      <button type="button" className="gen-link" onClick={() => newDeckInline(null)}>
                        ＋ New deck
                      </button>
                    )}
                    {pastLink}
                    {scopeNote}
                  </span>
                </div>
              )}
              {firstRun && !noQuestions && !creatingDeck && (
                <p className="setup-hint">Tick the topics you've covered, then press Next.</p>
              )}
              {naming && !inlineRename && (
                <DeckNameForm
                  initial={naming.mode === "rename" ? decksById.get(naming.deckId)?.name ?? "" : ""}
                  placeholder={naming.mode === "rename" ? "Name" : `Name the sub-deck of ${decksById.get(naming.deckId)?.name ?? ""}`}
                  onCancel={() => endNaming(naming.deckId, null)}
                  onSubmit={n => { if (naming.mode === "rename") endNaming(naming.deckId, n); else createDeckNamed(n, naming.deckId); }}
                />
              )}
              {!blank && !creatingDeck && (!naming || inlineRename) && (
                <input
                  type="search"
                  value={topicQuery}
                  onChange={e => setTopicQuery(e.target.value)}
                  placeholder="Search decks"
                  aria-label="Search decks"
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

            <div className={`topic-scroll${blank ? " is-plain" : ""}`} data-in="rise" style={{ marginTop: 2, "--i": 2 }}>
              {creatingDeck ? (
                <DeckNameForm onSubmit={n => createDeckNamed(n)} onCancel={() => setCreatingDeck(false)} />
              ) : blank ? renderEmpty() : forest.length === 0 ? (
                <div className="tg-rows-empty">
                  No decks yet. Press <strong>＋ New deck</strong> to make one.
                </div>
              ) : (
                <>
                {noQuestions && renderEmpty()}
                {deckList({
                  key: "all",
                  value: filter,
                  onChange: next => setFilter(f => ({ ...f, ...next })),
                  query: topicQuery,
                  allLabel: "Everything",
                  allAvail: null,
                  rowMenu,
                  onMove: (id, parentId, beforeId) => deckActions.moveDeck(id, parentId, beforeId),
                  /* Move to… offers the ready-made decks as well: a folder of
                     yours can go inside one, for you alone (2026-10-23). */
                  allForest: fullForest,
                  ...renameProps,
                  allowEmpty: true,
                })}
                </>
              )}
            </div>

            {/* A floating action bar: what is selected, and the way on. The
                band's blue on the white sheet, a capsule clear of the edges,
                under the list rather than over it. A strip in the sheet's own
                tints read as one more deck row cut off. */}
            <div className={`setup-dock setup-dock--next${noQuestions ? " is-hidden" : ""}${nothingChosen ? " is-away" : ""}`} aria-hidden={nothingChosen || undefined} data-in="rise" style={{ "--i": 3 }}>
              <div className="setup-next-bar">
              <p className="setup-next-sel">
                {scoped === 0 ? (nothingChosen ? "Choose what to revise" : "Nothing in these decks") : (
                  <>
                    <strong>{scoped} question{scoped === 1 ? "" : "s"}</strong>
                    {topicLabel ? <span> from {topicLabel}</span> : null}
                  </>
                )}
              </p>
              <button
                disabled={scoped === 0}
                onClick={() => goNext(false)}
                className="btn-press setup-next-btn"
              >
                Next <span aria-hidden="true">→</span>
              </button>
              </div>
            </div>
            </>
            )}
          </div>
        </div>
        {shareSheet}
        {deckFileSheet}
        {pastSheet}
        {manager}
        {reviewer}
        {suggestPrompt}
      </div>
    );
  }

  const q = queue[idx];
  const sel = sels[idx] ?? null;
  const isBookmarked = bookmarks.includes(q?.id);
  const peerSplit = q && Array.isArray(peer[q.id]) ? splitFor(q.opts, peer[q.id]) : null;

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
      peerSplit={peerSplit}
    />
  );
}
