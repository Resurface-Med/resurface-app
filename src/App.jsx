import { useState, useEffect, useLayoutEffect, useMemo, useRef, Component, lazy, Suspense } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "Poppins, sans-serif", color: "#d64545", background: "#3562f5", minHeight: "100vh" }}>
          <div style={{ fontSize: 20, marginBottom: 16, color: "#fff", fontWeight: 600 }}>Runtime error</div>
          <div style={{ fontSize: 14, color: "#d64545", whiteSpace: "pre-wrap", background: "#fff", padding: 20, borderRadius: 18, border: "1px solid rgba(214,69,69,0.25)", boxShadow: "0 22px 48px rgba(20,44,130,0.2)" }}>
            {this.state.error.toString()}
            {"\n\n"}
            {this.state.error.stack}
          </div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 20, padding: "10px 20px", background: "#fff", border: "none", borderRadius: 999, color: "#3562f5", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { V, C, NAV, card, primaryBtn, btnGhost } from "./ui/theme";
import { QUESTIONS, loadDecks, setUserQuestions, setQuestionEdits } from "./data";
import { sm2Review, isReviewDue } from "./lib/sm2";
import { themeStore, todayKey, nextStreak } from "./lib/storage";
import { useAuth } from "./lib/auth";
import { loadAll, remote, flushQueue, fetchIsAdmin } from "./lib/remote";
import { deckCodeFromLocation, decorateUserQuestion, indexDecks, questionsInDeck } from "./lib/decks";
import LoginPage from "./views/LoginPage";
import NewPasswordPage from "./views/NewPasswordPage";
import MarketingPrompt from "./views/MarketingPrompt";
import { Sidebar } from "./views/Nav";
import { ConfirmHost } from "./ui/Confirm";
import Dashboard from "./views/Dashboard";

/* How long the outgoing view is held behind the arriving one. Must outlast
   `view-enter` in index.css — drop it early and the hole comes back. */
const VIEW_SWAP_MS = 560;

/* Kept as named loaders rather than inline, because navigation waits on
   them as well as `lazy` — see `go`. Calling one twice is free: an import
   already in flight or already done hands back the same promise. */
const CHUNK = {
  [V.STUDY]:       () => import("./modes/PracticeMode"),
  [V.PROGRESS]:    () => import("./views/StatsView"),
  [V.LEADERBOARD]: () => import("./views/LeaderboardView"),
  [V.PROFILE]:     () => import("./views/ProfileView"),
  [V.GENERATE]:    () => import("./views/GenerateMode"),
  [V.ADMIN]:       () => import("./views/AdminView"),
};
const StudyMode       = lazy(CHUNK[V.STUDY]);
const ProgressView    = lazy(CHUNK[V.PROGRESS]);
const LeaderboardView = lazy(CHUNK[V.LEADERBOARD]);
const ProfileView     = lazy(CHUNK[V.PROFILE]);
const GenerateMode    = lazy(CHUNK[V.GENERATE]);
const AdminView       = lazy(CHUNK[V.ADMIN]);

const PRACTICE_SESSION_KEY = "pq_practice_session";

function isGoogleUser(user) {
  const providers = user?.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("google")) return true;
  return user?.app_metadata?.provider === "google";
}

function googleName(user) {
  const m = user?.user_metadata || {};
  return String(m.full_name || m.name || "").trim();
}

/** Shared by both buttons in the leave-session dialog, so they cannot drift
 *  apart in height. nowrap because a wrapped label is what made them fat. */
const dialogBtn = { flex: 1, padding: "12px 18px", fontSize: 14.5, whiteSpace: "nowrap" };

export default function App() {
  const { user, loading: authLoading, configured, signOut, recovering } = useAuth();

  const [view, setView] = useState(V.DASH);
  const [pendingView, setPendingView] = useState(null);
  const [practiceSessionActive, setPracticeSessionActive] = useState(false);

  // Server-first: these start empty and are filled from Postgres on sign-in.
  const [pStats, setPStats] = useState({});
  const [srCards, setSrCards] = useState({});
  const [bookmarks, setBookmarks] = useState([]);
  const [streak, setStreak] = useState({ streak: 0, longest: 0, lastDate: null });
  const [activity, setActivity] = useState({});
  const [dailyGoal, setDailyGoal] = useState(20);
  const [displayName, setDisplayName] = useState("");
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [generated, setGenerated] = useState([]);
  /* Your decks, as rows; the tree is built where it is shown. */
  const [decks, setDecks] = useState([]);
  /* A deck to land on in Study — after a share link, or after Generate. */
  const [openDeckId, setOpenDeckId] = useState(null);
  /* The deck Generate should file its next questions into. */
  const [generateInto, setGenerateInto] = useState(null);
  /* Set only by the dashboard's own button, so Study reached from the
     sidebar still opens the picker. */
  const [autoStart, setAutoStart] = useState(false);

  /* The bank is one pool: the shipped questions plus your own. Every screen
     that shows or serves a question reads QUESTIONS, so this is the one
     place your own questions get into it. Rows are given their deck path
     here, so decks and questions are always applied together. */
  const genRowsRef = useRef([]);
  /* The deck list as it is now, not as it was when a callback was made.
     Generate creates a deck and saves questions into it in one go: the
     save's callback closed over the deck list from before the create, so
     the new questions were filed against a deck that list had never heard
     of and arrived as "Unfiled" — until a reload, which is what made it
     look like the questions had not saved. */
  const decksRef = useRef([]);
  function applyGenerated(rows, deckRows = decksRef.current) {
    genRowsRef.current = rows;
    const byId = indexDecks(deckRows);
    const decorated = rows.map(r => decorateUserQuestion(r, byId));
    setUserQuestions(decorated);
    setGenerated(decorated);
  }
  function applyDecks(deckRows) {
    decksRef.current = deckRows;
    setDecks(deckRows);
    applyGenerated(genRowsRef.current, deckRows);
  }
  const [dataLoading, setDataLoading] = useState(true);

  // Theme is the one thing still read locally, so the page doesn't paint the
  // wrong colour for a frame while auth resolves.
  const [theme, setTheme] = useState(() => themeStore.get());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    themeStore.set(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0b1220' : '#3562f5';
  }, [theme]);

  // Pull the snapshot once per signed-in user. Depend on user.id — not the
  // user object — so a tab-focus token refresh doesn't remount the whole app
  // and wipe an in-progress practice session.
  useEffect(() => {
    if (!user?.id || recovering) { setDataLoading(false); return; }
    let cancelled = false;
    setDataLoading(true);
    (async () => {
      // In parallel: the bank doesn't depend on the user, and the user's rows
      // don't depend on the bank.
      const [, d] = await Promise.all([
        loadDecks(),
        (async () => { await flushQueue(); return loadAll(user.id); })(),
      ]);
      if (cancelled) return;
      setPStats(d.pStats);
      setSrCards(d.srCards);
      setBookmarks(d.bookmarks);
      setStreak(d.streak);
      setActivity(d.activity);
      setDailyGoal(d.dailyGoal);
      setDisplayName(d.displayName || "");
      setShowOnLeaderboard(d.showOnLeaderboard !== false);
      setMarketingOptIn(d.marketingOptIn);
      // Before the questions, so the pool is only rebuilt with both in hand.
      setQuestionEdits(d.questionEdits);
      applyDecks(d.decks ?? []);
      applyGenerated(d.generated, d.decks ?? []);
      setDataLoading(false);

      // Arrived by a share link: copy the deck to this account and open
      // Study on it. The address goes back to the root so a reload does not
      // copy it twice.
      const code = deckCodeFromLocation();
      if (code) {
        window.history.replaceState(null, "", "/");
        try {
          const id = await remote.copyDeckByCode(code);
          if (cancelled) return;
          if (id) {
            const fresh = await loadAll(user.id);
            if (cancelled) return;
            applyDecks(fresh.decks ?? []);
            applyGenerated(fresh.generated, fresh.decks ?? []);
            setOpenDeckId(id);
            setView(V.STUDY);
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, recovering]);

  // ── Decks ─────────────────────────────────────────────────────────────
  // Optimistic like everything else. Creating waits for the id.
  async function createDeck(name, parentId = null) {
    const siblings = decks.filter(d => (d.parentId ?? null) === parentId);
    const row = await remote.createDeck(user.id, name, parentId, siblings.length);
    const d = { id: row.id, name, parentId, position: siblings.length, shareCode: row.share_code, createdAt: row.created_at };
    applyDecks([...decks, d]);
    return d;
  }
  function renameDeck(id, name) {
    applyDecks(decks.map(d => d.id === id ? { ...d, name } : d));
    remote.updateDeck(id, { name });
  }
  /* Deleting a deck deletes what is under it — its sub-decks and their
     questions — the way a deck does. The database cascades; the pool is
     pruned here so nothing lingers until the next load. */
  function deleteDeck(id) {
    const gone = new Set();
    (function collect(x) { gone.add(x); decks.filter(d => d.parentId === x).forEach(d => collect(d.id)); })(id);
    const keptDecks = decks.filter(d => !gone.has(d.id));
    const keptRows = genRowsRef.current.filter(r => !gone.has(r.deckId));
    decksRef.current = keptDecks;
    setDecks(keptDecks);
    applyGenerated(keptRows, keptDecks);
    remote.deleteDeck(id);
  }
  /* Copy bank topics into a deck: each becomes a sub-deck holding copies of
     the topic's questions — yours, with fresh ids, like an import. */
  async function copyBankTopics(targetId, nodes) {
    let deckRows = decks;
    let rows = genRowsRef.current;
    for (const n of nodes) {
      const qs = questionsInDeck(n.id).filter(q => !q.gen);
      if (!qs.length) continue;
      const siblings = deckRows.filter(d => (d.parentId ?? null) === targetId);
      const sub = await remote.createDeck(user.id, n.name, targetId, siblings.length);
      const subRow = { id: sub.id, name: n.name, parentId: targetId, position: siblings.length, shareCode: sub.share_code, createdAt: sub.created_at };
      deckRows = [...deckRows, subRow];
      const payloads = qs.map(({ q, opts, ans, exp, optExp, img }) => ({ q, opts, ans, exp, optExp, ...(img ? { img } : {}) }));
      const ids = await remote.addGenerated(user.id, payloads, sub.id);
      if (ids) rows = [...rows, ...payloads.map((p, i) => ({ ...p, id: ids[i], gen: true, deckId: sub.id }))];
    }
    setDecks(deckRows);
    applyGenerated(rows, deckRows);
  }
  /* Re-parent a deck. Refused if the target is the deck itself or under it. */
  function moveDeck(id, parentId) {
    let p = parentId;
    while (p) { if (p === id) return; p = decks.find(d => d.id === p)?.parentId ?? null; }
    applyDecks(decks.map(d => d.id === id ? { ...d, parentId: parentId ?? null } : d));
    remote.updateDeck(id, { parent_id: parentId ?? null });
  }
  function deleteQuestion(qid) {
    const rows = genRowsRef.current.filter(r => r.id !== qid);
    applyGenerated(rows);
    remote.removeGenerated(user.id, qid);
  }
  function moveQuestion(qid, deckId) {
    const rows = genRowsRef.current.map(r => r.id === qid ? { ...r, deckId } : r);
    applyGenerated(rows);
    const q = rows.find(r => r.id === qid);
    if (q) remote.moveGenerated(user.id, q, deckId);
  }
  const deckActions = { createDeck, renameDeck, deleteDeck, moveDeck, copyBankTopics, deleteQuestion, moveQuestion };

  useEffect(() => {
    if (!user) return;
    const warm = () => {
      import("./modes/PracticeMode");
      import("./views/StatsView");
      import("./views/LeaderboardView");
      import("./views/ProfileView");
      import("./views/GenerateMode");
    };
    const ric = window.requestIdleCallback;
    const id = ric ? ric(warm, { timeout: 3000 }) : setTimeout(warm, 1500);
    return () => (ric ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, [user]);

  // A tab that was open while the network went out gets a chance to catch up.
  useEffect(() => {
    if (!user) return;
    const onBack = () => { if (document.visibilityState === "visible") flushQueue(); };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [user]);

  /** Every answer counts once toward today's activity and the streak. */
  function countStudied() {
    const day = todayKey();
    setActivity(prev => {
      const next = { ...prev, [day]: (prev[day] || 0) + 1 };
      remote.activity(user.id, day, next[day]);
      return next;
    });
    setStreak(prev => {
      const next = nextStreak(prev);
      if (next !== prev) remote.streak(user.id, next);
      return next;
    });
  }

  /**
   * Every answer both records the attempt and schedules the question.
   *
   * There is no separate flashcard rating any more, so the quality comes from
   * the answer itself: right is a Good, wrong is an Again. That keeps the SM-2
   * engine — questions still resurface before you forget them — without asking
   * anyone to grade their own recall on a four-point scale.
   */
  function recordAnswer(id, correct) {
    setPStats(prev => {
      const s = prev[id] || { correct: 0, total: 0 };
      const row = { correct: s.correct + (correct ? 1 : 0), total: s.total + 1 };
      remote.practice(user.id, id, row.correct, row.total);
      return { ...prev, [id]: row };
    });

    setSrCards(prev => {
      const card = sm2Review(prev[id], correct ? 3 : 1);
      remote.sr(user.id, id, card);
      return { ...prev, [id]: card };
    });

    countStudied();
  }

  function toggleBookmark(id) {
    setBookmarks(b => {
      const has = b.includes(id);
      if (has) remote.removeBookmark(user.id, id);
      else remote.addBookmark(user.id, id);
      return has ? b.filter(x => x !== id) : [...b, id];
    });
  }


  const [launchFilter, setLaunchFilter] = useState({ deck: "All", cat: "All" });
  const [studyScope, setStudyScope] = useState("all");

  // Scheduled reviews only. isDue() calls an unseen card due, which is right
  // for the study queue but told a brand-new account that 497 questions were
  // "ready to review" directly beneath "Seen: 0".
  const dueCount = useMemo(() => QUESTIONS.filter(q => isReviewDue(srCards[q.id])).length, [srCards]);

  /**
   * One door for every navigation, so the keyed wrapper always remounts.
   *
   * Every view but the dashboard is a chunk of its own, and the switch
   * animates whatever the arriving view renders — so a view that has not
   * been fetched animates its Suspense fallback, which has no band and no
   * sheet, and the real page drops into place when the chunk lands. That is
   * the first visit to each tab, every session. Warming them on idle helps
   * only if you wait, and the first thing anyone does is start tapping.
   *
   * So the view changes once its chunk is in hand. Already loaded, that is
   * a microtask and nothing is delayed; not loaded, the page you are on
   * stays put a moment longer instead of animating an empty one. The token
   * keeps a slow chunk from landing on top of a later tap.
   */
  const navToken = useRef(0);
  function go(next) {
    const chunk = CHUNK[next];
    if (!chunk) { setView(next); return; }
    const mine = ++navToken.current;
    const arrive = () => { if (navToken.current === mine) setView(next); };
    chunk().then(arrive, arrive);
  }

  /*
   * Switching views, without the screen ever being empty.
   *
   * A keyed swap unmounts the old view in the same frame the new one
   * mounts. Whatever the new view then did — fade, sweep, rise — it did
   * over a blank page, and it was the blank page that read as a flash.
   * No entrance animation can fix that, because the entrance is not the
   * problem: the hole in front of it is.
   *
   * So the old view stays. It is held, still and fully opaque, behind the
   * arriving one while that one comes up over it, and dropped only once
   * the new page covers it — which is not a moment you can see. Nothing
   * underneath is ever exposed, so there is nothing left to blink.
   *
   * `shown` is [leaving, current] through a switch, and [current] at rest.
   */
  const [leaving, setLeaving] = useState(null);
  const [shownFor, setShownFor] = useState(view);
  if (shownFor !== view) {
    /* Set during render rather than in an effect: an effect would let one
       frame of the new view paint alone before the old one was put behind
       it, which is the hole we are here to close. */
    setLeaving(shownFor);
    setShownFor(view);
  }
  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setLeaving(null), VIEW_SWAP_MS);
    return () => clearTimeout(t);
  }, [leaving, view]);

  const switching = leaving !== null && leaving !== view;
  /*
   * Where the wave ends up is set by the height of the band above it, and
   * that differs from view to view. The arriving sheet rises to its own
   * wave line, and if that line is higher than the one it is replacing all
   * is well — it covers the old sheet on the way past.
   *
   * If it is lower, the strip between the two lines belongs to the new
   * page's blue field, and the old sheet is still sitting in it. Being
   * behind and never moved, it stays white through the whole switch and
   * turns blue the instant the old page is dropped — the page changing
   * after the animation has finished.
   *
   * So the old sheet settles too, by exactly the difference between the
   * two band heights, which lands its wave on the same line as the new
   * one. Both waves arrive together, the strip above them is blue before
   * anything is dropped, and letting go of the old page changes nothing.
   * It has to be measured: no stylesheet knows the height of two bands.
   */
  const stackRef = useRef(null);
  useLayoutEffect(() => {
    if (!switching) return;
    let done = false;
    const apply = () => {
    const root = stackRef.current;
    const out = root?.querySelector(".view-swap.is-leaving");
    const arriving = root?.querySelector(".view-swap.is-entering");
    /*
     * Wait for the arriving view to exist, but only for that.
     *
     * `lazy` renders its fallback once even when the module is already in
     * hand — it needs a pass to read its own settled promise — and running
     * against that commit and stopping is what once left the old sheet
     * sitting where it was, to jump when the page was dropped. The fallback
     * is null, so a wrapper with no children at all is that commit, and the
     * observer below waits it out.
     *
     * A view that has rendered something but has no band is a different
     * thing — a study session has none — and waiting for one would never
     * end. That case falls through and is handled below.
     *
     * Landing late is safe either way: a custom property inside a keyframe
     * is re-resolved when it changes, so a delta that arrives a tick after
     * the settle has started still steers it, and that early on the
     * distance covered is too small to see.
     */
    if (!out || !arriving || !arriving.firstElementChild) return;
    done = true;

    const outBand = out.querySelector(".page-band");
    const inBand = arriving.querySelector(".page-band");

    /*
     * Send the arriving view to the top, and hold the one leaving where it
     * was while that happens.
     *
     * Switching tabs never reset the scroller, so a new view opened at
     * whatever offset the last one was left at. Worse, the two views share
     * a grid cell, so the scroller stays as tall as the taller of them for
     * the length of the switch: leave a long list scrolled down for a short
     * page and the height collapses when the old view is dropped, the
     * browser clamps the offset, and the whole page jumps at the very end
     * of the animation. Measured at 1900px on a 3000px list.
     *
     * Resetting alone would drag the outgoing page up the screen with it,
     * so it is pushed back down by exactly what was taken off. It ends up
     * painted where it already was, and the page you are going to starts
     * at its top, which is where a tab should start.
     */
    const scroller = root.closest(".app-main");
    if (scroller && scroller.scrollTop > 0) {
      out.style.setProperty("--scroll-hold", `${-scroller.scrollTop}px`);
      out.classList.add("is-held");
      scroller.scrollTop = 0;
    }

    /* Everything past here needs both bands. A session has none. */
    if (!outBand || !inBand) return;
    /* offsetHeight is layout, so the band's own roll does not disturb it. */
    out.style.setProperty("--band-delta", `${inBand.offsetHeight - outBand.offsetHeight}px`);

    /*
     * And the old sheet borrows the new one's colour while it is on its
     * way out. The two waves converge on the same line, so for the last
     * stretch of the switch the old sheet shows through as a wedge above
     * the new one, narrowing to a hairline before it closes — and views do
     * not all use the same white, so that hairline reads as a line drawn
     * along the swoosh. Two sheets the same colour can overlap by any
     * amount and show nothing at all. The wave is the sheet's own edge, so
     * its fill comes across too.
     */
    const after = el => {
      const kids = [...el.parentElement.children];
      return kids.slice(kids.indexOf(el) + 1);
    };
    after(outBand).forEach((el, i) => {
      const ref = after(inBand)[i];
      if (!ref) return;
      el.style.backgroundColor = getComputedStyle(ref).backgroundColor;
      const path = el.querySelector("svg path");
      const refPath = ref.querySelector("svg path");
      if (path && refPath) path.setAttribute("fill", getComputedStyle(refPath).fill);
    });
    };
    apply();
    if (done) return;
    /* Watched rather than polled: the band appears when React commits the
       real view, which is its own event, not a matter of time passing. */
    const seen = new MutationObserver(() => {
      apply();
      if (done) seen.disconnect();
    });
    if (stackRef.current) seen.observe(stackRef.current, { childList: true, subtree: true });
    return () => seen.disconnect();
  }, [switching, leaving, view]);

  /* The outgoing page first and the arriving one second, so the arriving
     one paints in front: it closes over the page you were on, which sits
     still underneath until it is covered. Nothing is ever uncovered, so
     there is nothing that can flash. */
  const shown = switching ? [leaving, view] : [view];
  /* Both marks last exactly as long as the switch does. Nothing they turn
     on may outlive it: a stacking context would trap a modal's z-index
     inside the view, and a page held still would stop anything that mounts
     in it later — an expanded section, a deck's rows — from ever arriving. */

  function handleNav(newView) {
    if (view === V.STUDY && newView !== V.STUDY && practiceSessionActive) {
      setPendingView(newView);
      return;
    }
    go(newView);
  }

  /* Asked once per session. The answer only decides whether a nav item is
     drawn — every function behind it checks the admins table itself. */
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let cancelled = false;
    fetchIsAdmin().then(ok => { if (!cancelled) setIsAdmin(ok); });
    return () => { cancelled = true; };
  }, [user]);

  /*
   * The sidebar is `display: none` through a session and comes back the
   * instant one ends — and being sticky, it is positioned, so it paints
   * above the session shell still sliding away beneath it. It arrived
   * fully formed on top of a transition in progress, which is the one
   * thing on this screen that had no animation at all.
   *
   * Marked for as long as it takes to come back, so the nav can be given
   * an arrival without every page load growing one.
   */
  const [navReturning, setNavReturning] = useState(false);
  const wasInSession = useRef(practiceSessionActive);
  useEffect(() => {
    const left = wasInSession.current && !practiceSessionActive;
    wasInSession.current = practiceSessionActive;
    if (!left) return;
    setNavReturning(true);
    const t = setTimeout(() => setNavReturning(false), VIEW_SWAP_MS);
    return () => clearTimeout(t);
  }, [practiceSessionActive]);

  const nav = {
    view, setView: handleNav, dueCount, isAdmin,
    email: user?.email,
    displayName,
    onSignOut: signOut,
  };


  // Auth gates the whole app. `configured` is false when the Supabase env vars
  // are missing, in which case sign-in can't work at all and saying so beats
  // an empty login form that silently fails.
  if (!configured) {
    return (
      <div style={{ minHeight: "var(--app-vh)", display: "grid", placeItems: "center", padding: 32 }}>
        <div style={{ ...card, maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8 }}>Sign-in isn't configured</div>
          <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.6 }}>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then reload.
          </div>
        </div>
      </div>
    );
  }

  // Before the loading gate on purpose: a recovery session makes `user` truthy,
  // which starts the data load, which used to replace this screen mid-flow.
  if (user && recovering) return <NewPasswordPage />;

  // Only block on the first auth/data bootstrap. Later token refreshes must
  // not tear down StudyMode — that was ending practice sessions on tab-away.
  if (authLoading || (user && dataLoading)) {
    return (
      <div style={{ minHeight: "var(--app-vh)", display: "grid", placeItems: "center" }}>
        <div style={{ color: "var(--c-on-field)", fontSize: 15, fontWeight: 500, opacity: 0.9 }}>
          Loading your progress…
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <ErrorBoundary>
    <div className={`app-shell${practiceSessionActive ? " is-session" : ""}${navReturning ? " is-nav-returning" : ""}`}>
      <Sidebar {...nav} />
      {isGoogleUser(user) && marketingOptIn === null && !practiceSessionActive && (
        <MarketingPrompt
          googleName={displayName || googleName(user)}
          onContinue={({ displayName: nextName, marketingOptIn: emails }) => {
            remote.profile(user.id, {
              marketingOptIn: emails,
              ...(nextName ? { displayName: nextName } : {}),
            });
            setMarketingOptIn(emails);
            if (nextName) setDisplayName(nextName);
          }}
        />
      )}
      <ConfirmHost />
      {pendingView && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(26, 47, 122, 0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}>
          <div style={{ ...card, maxWidth: 380, width: "90%", textAlign: "center", padding: "36px 28px" }}>
            <div style={{ fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 8, letterSpacing: -0.3 }}>Leave session?</div>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 28, lineHeight: 1.55 }}>
              Your progress will be saved. You can pick up exactly where you left off.
            </div>
            {/* "Save and leave" was too long for half of a 340px dialog, so it
                wrapped to two lines and the button grew to fit — twice the
                height of the one beside it. The body already promises the save,
                and the title asks a question, so the two buttons are just its
                answers. Both share one set of metrics; the old pair were
                hand-rolled separately at different padding and font sizes. */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { go(pendingView); setPendingView(null); }}
                className="btn-press"
                style={{ ...primaryBtn, ...dialogBtn }}>
                Leave
              </button>
              <button onClick={() => setPendingView(null)} className="btn-press"
                style={{ ...btnGhost, ...dialogBtn }}>
                Stay
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="app-content">
        <div className="app-main">
          {/* Two views only while one is replacing the other: the outgoing
              one behind, the arriving one over it. Keyed, so React keeps the
              outgoing instance alive rather than rebuilding it. */}
          <div className="view-stack" ref={stackRef}>
          {shown.map(v => {
          const out = switching && v === leaving;
          const cls = ["view-swap",
            out && "is-leaving",
            switching && !out && "is-entering"].filter(Boolean).join(" ");
          return (
          <div key={v} className={cls}
            aria-hidden={out ? "true" : undefined}
            inert={out ? "" : undefined}>
          {/* Nothing, rather than a word. Navigation waits for the chunk (see
              `go`), so this shows for at most the single commit `lazy` needs
              to read its own resolved promise — and the page being left is
              still behind it, which is a better thing to be looking at than
              "Loading…" appearing and vanishing in a frame. */}
          <Suspense fallback={null}>
          {v === V.DASH && <Dashboard pStats={pStats} streak={streak} dueCount={dueCount} setView={go}
            activity={activity}
            srCards={srCards}
            dailyGoal={dailyGoal}
            onGoalChange={g => { setDailyGoal(g); remote.goal(user.id, g); }}
            onStudy={s => {
              setLaunchFilter({ deck: "All", cat: "All" });
              setStudyScope(s);
              setAutoStart(true);
              go(V.STUDY);
            }} />}

          {v === V.STUDY && <StudyMode key={`${studyScope}|${launchFilter.deck}|${launchFilter.cat}`} scope={studyScope}
            pStats={pStats} srCards={srCards} bookmarks={bookmarks}
            onAnswer={recordAnswer} onToggleBookmark={toggleBookmark}
            launchFilter={launchFilter} onSessionActive={setPracticeSessionActive}
            decks={decks} deckActions={deckActions}
            openDeckId={openDeckId} onOpenDeckConsumed={() => setOpenDeckId(null)}
            autoStart={autoStart} onAutoStartConsumed={() => setAutoStart(false)}
            onGenerateInto={id => { setGenerateInto(id); go(V.GENERATE); }}
            onRequestExit={() => setPendingView(V.DASH)} />}

          {v === V.PROGRESS && <ProgressView pStats={pStats} setView={go}
            setLaunchFilter={setLaunchFilter} setStudyScope={setStudyScope}
            onClearP={() => { remote.clearPractice(user.id); setPStats({}); }}
            onClearSR={() => { remote.clearSR(user.id); setSrCards({}); }} />}

          {v === V.LEADERBOARD && <LeaderboardView userId={user.id} />}

          {v === V.ADMIN && <AdminView />}

          {v === V.PROFILE && (
            <ProfileView
              key={user.id}
              userId={user.id}
              email={user.email}
              displayName={displayName}
              showOnLeaderboard={showOnLeaderboard}
              marketingOptIn={marketingOptIn}
              dailyGoal={dailyGoal}
              theme={theme}
              onThemeChange={setTheme}
              onProfileChange={p => {
                if (p.displayName !== undefined) setDisplayName(p.displayName);
                if (p.showOnLeaderboard !== undefined) setShowOnLeaderboard(p.showOnLeaderboard);
                if (p.marketingOptIn !== undefined) setMarketingOptIn(p.marketingOptIn);
                if (p.dailyGoal !== undefined) setDailyGoal(p.dailyGoal);
              }}
              onResetProgress={() => {
                remote.clearPractice(user.id);
                remote.clearSR(user.id);
                setPStats({});
                setSrCards({});
              }}
              onSignOut={signOut}
            />
          )}

          {v === V.GENERATE && <GenerateMode savedGenerated={generated} onGeneratedChange={applyGenerated}
            decks={decks} deckActions={deckActions}
            targetDeckId={generateInto}
            onTargetDeckChange={id => setGenerateInto(id)}
            onOpenDeck={id => { setOpenDeckId(id); go(V.STUDY); }}
            onPractise={(deck, cat) => { setLaunchFilter({ deck, cat }); setStudyScope("all"); go(V.STUDY); }} />}


          </Suspense>
          </div>
          );})}
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
