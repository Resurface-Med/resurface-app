import { useState, useEffect, useMemo, Component, lazy, Suspense } from "react";

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
import { V, C, card, primaryBtn } from "./ui/theme";
import { QUESTIONS, loadDecks } from "./data";
import { sm2Review, isReviewDue } from "./lib/sm2";
import { themeStore, todayKey, nextStreak } from "./lib/storage";
import { useAuth } from "./lib/auth";
import { loadAll, remote, flushQueue } from "./lib/remote";
import LoginPage from "./views/LoginPage";
import NewPasswordPage from "./views/NewPasswordPage";
import { Sidebar } from "./views/Nav";
import Dashboard from "./views/Dashboard";

const StudyMode    = lazy(() => import("./modes/PracticeMode"));
const ProgressView = lazy(() => import("./views/StatsView"));
const GenerateMode = lazy(() => import("./views/GenerateMode"));

const PRACTICE_SESSION_KEY = "pq_practice_session";

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
  const [generated, setGenerated] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Theme is the one thing still read locally, so the page doesn't paint the
  // wrong colour for a frame while auth resolves.
  const [theme, setTheme] = useState(() => themeStore.get());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    themeStore.set(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  // Pull the snapshot once per sign-in, and retry anything a dropped
  // connection parked earlier.
  useEffect(() => {
    if (!user || recovering) { setDataLoading(false); return; }
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
      setGenerated(d.generated);
      setDataLoading(false);
    })();
    return () => { cancelled = true; };
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

  // Two different numbers that used to be one. `dueCount` is scheduled reviews;
  // `newCount` is questions never attempted. Collapsing them meant a new account
  // was told 497 questions were "ready to review".
  const dueCount = useMemo(() => QUESTIONS.filter(q => isReviewDue(srCards[q.id])).length, [srCards]);
  const newCount = useMemo(() => QUESTIONS.filter(q => !srCards[q.id]).length, [srCards]);

  function handleNav(newView) {
    if (view === V.STUDY && newView !== V.STUDY && practiceSessionActive) {
      setPendingView(newView);
      return;
    }
    setView(newView);
  }

  const nav = { view, setView: handleNav, dueCount, email: user?.email, onSignOut: signOut };

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
    <div style={{ display: "flex", minHeight: "var(--app-vh)", gap: "clamp(8px, 1vw, 18px)", background: "transparent" }}>
      <Sidebar {...nav} />
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
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setView(pendingView); setPendingView(null); }}
                className="btn-press"
                style={{ ...primaryBtn, flex: 1 }}>
                Save and leave
              </button>
              <button onClick={() => setPendingView(null)} className="btn-press" style={{
                flex: 1, padding: "12px 16px", borderRadius: "var(--r-pill)",
                border: "1px solid var(--c-border)", background: "var(--c-surface2)",
                color: C.sub, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
                Stay
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={toggleTheme}
        className="btn-press"
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          position: "fixed", top: 18, right: 22, zIndex: 500,
          height: 36, padding: "0 14px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.28)",
          borderRadius: "var(--r-pill)",
          boxShadow: "0 10px 24px rgba(15,27,61,0.15)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer", fontSize: 13, fontWeight: 600,
          color: "#fff", letterSpacing: -0.1,
        }}
      >{theme === "dark" ? "Light" : "Night"}</button>

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <Suspense fallback={
            <div style={{ padding: 48, color: "var(--c-on-field-soft)", fontSize: 15 }}>Loading…</div>
          }>
          {view === V.DASH && <Dashboard pStats={pStats} streak={streak} dueCount={dueCount} setView={setView}
            activity={activity}
            newCount={newCount}
            dailyGoal={dailyGoal}
            onGoalChange={g => { setDailyGoal(g); remote.goal(user.id, g); }}
            onStudy={s => { setStudyScope(s); setView(V.STUDY); }} />}

          {view === V.STUDY && <StudyMode key={studyScope} scope={studyScope}
            pStats={pStats} srCards={srCards} bookmarks={bookmarks}
            onAnswer={recordAnswer} onToggleBookmark={toggleBookmark}
            launchFilter={launchFilter} onSessionActive={setPracticeSessionActive} />}

          {view === V.PROGRESS && <ProgressView pStats={pStats} srCards={srCards} setView={setView} setLaunchFilter={setLaunchFilter}
            onClearP={() => { remote.clearPractice(user.id); setPStats({}); }}
            onClearSR={() => { remote.clearSR(user.id); setSrCards({}); }} />}

          {view === V.GENERATE && <GenerateMode savedGenerated={generated} onGeneratedChange={setGenerated} />}

          </Suspense>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
