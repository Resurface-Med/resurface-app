import { useState, useEffect, useMemo, Component } from "react";

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
import { QUESTIONS } from "./data";
import { sm2Review, isDue } from "./lib/sm2";
import { practiceStore, srStore, bookmarkStore, activityStore, updateStreak, loadStreak, themeStore } from "./lib/storage";
import { usePomodoro } from "./lib/pomodoro";
import { Sidebar } from "./views/Nav";
import Dashboard from "./views/Dashboard";
import PracticeMode from "./modes/PracticeMode";
import SRMode from "./modes/SRMode";
import TimedMode from "./modes/TimedMode";
import StatsView from "./views/StatsView";
import BookmarksView from "./views/BookmarksView";
import WrongAnswers from "./views/WrongAnswers";
import SubjectsPage from "./views/SubjectsPage";
import GenerateMode from "./views/GenerateMode";
import PomodoroPage from "./views/PomodoroPage";
import PomodoroToast from "./views/PomodoroToast";

const PRACTICE_SESSION_KEY = "pq_practice_session";

export default function App() {
  const [view, setView] = useState(V.DASH);
  const [pendingView, setPendingView] = useState(null);
  const [practiceSessionActive, setPracticeSessionActive] = useState(false);
  const [pStats, setPStats] = useState(() => practiceStore.load());
  const [srCards, setSrCards] = useState(() => srStore.load());
  const [bookmarks, setBookmarks] = useState(() => bookmarkStore.load());
  const [streak, setStreak] = useState(() => loadStreak());
  const [theme, setTheme] = useState(() => themeStore.get());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    themeStore.set(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  useEffect(() => { bookmarkStore.save(bookmarks); }, [bookmarks]);

  function recordAnswer(id, correct) {
    setPStats(prev => {
      const s = prev[id] || { correct: 0, total: 0 };
      const next = { ...prev, [id]: { correct: s.correct + (correct ? 1 : 0), total: s.total + 1 } };
      practiceStore.save(next); return next;
    });
    activityStore.record();
    setStreak(updateStreak());
  }

  function recordSR(id, quality) {
    setSrCards(prev => {
      const next = { ...prev, [id]: sm2Review(prev[id], quality) };
      srStore.save(next); return next;
    });
    activityStore.record();
    setStreak(updateStreak());
  }

  function toggleBookmark(id) {
    setBookmarks(b => b.includes(id) ? b.filter(x => x !== id) : [...b, id]);
  }

  const pomodoro = usePomodoro();

  const [launchFilter, setLaunchFilter] = useState({ deck: "All", cat: "All" });

  const dueCount = useMemo(() => QUESTIONS.filter(q => isDue(srCards[q.id])).length, [srCards]);
  const wrongCount = useMemo(() => QUESTIONS.filter(q => { const s = pStats[q.id]; return s && s.total > 0 && (s.correct / s.total) < 0.6; }).length, [pStats]);

  function handleNav(newView) {
    if (view === V.PRACTICE && newView !== V.PRACTICE && practiceSessionActive) {
      setPendingView(newView);
      return;
    }
    setView(newView);
  }

  const nav = { view, setView: handleNav, dueCount, bmCount: bookmarks.length, wrongCount, pomodoro };

  return (
    <ErrorBoundary>
    <div style={{ display: "flex", minHeight: "var(--app-vh)", gap: 0, background: "transparent" }}>
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
          {view === V.DASH && <Dashboard pStats={pStats} srCards={srCards} streak={streak} dueCount={dueCount} bmCount={bookmarks.length} setView={setView}
            activity={activityStore.load()}
            onAnswer={recordAnswer}
            onClearP={() => { practiceStore.clear(); setPStats({}); }}
            onClearSR={() => { srStore.clear(); setSrCards({}); }} />}
          {view === V.SUBJECTS && <SubjectsPage pStats={pStats} srCards={srCards} setView={setView} setLaunchFilter={setLaunchFilter} />}
          {view === V.PRACTICE && <PracticeMode pStats={pStats} bookmarks={bookmarks} onAnswer={recordAnswer} onToggleBookmark={toggleBookmark} launchFilter={launchFilter} onSessionActive={setPracticeSessionActive} />}
          {view === V.SR && <SRMode pStats={pStats} srCards={srCards} bookmarks={bookmarks} onReview={recordSR} onToggleBookmark={toggleBookmark} launchFilter={launchFilter} />}
          {view === V.TIMED && <TimedMode pStats={pStats} onAnswer={recordAnswer} launchFilter={launchFilter} />}
          {view === V.WRONG && <WrongAnswers pStats={pStats} bookmarks={bookmarks} onAnswer={recordAnswer} onToggleBookmark={toggleBookmark} />}
          {view === V.STATS && <StatsView pStats={pStats} srCards={srCards} setView={setView} setLaunchFilter={setLaunchFilter} />}
          {view === V.BOOKMARKS && <BookmarksView bookmarks={bookmarks} pStats={pStats} onToggleBookmark={toggleBookmark} />}
          {view === V.GENERATE && <GenerateMode />}
          {view === V.POMODORO && <PomodoroPage {...pomodoro} />}
        </div>
      </div>
    </div>
    <PomodoroToast
      toast={pomodoro.toast}
      onDismiss={pomodoro.dismissToast}
      onStart={pomodoro.startFromToast}
    />
    </ErrorBoundary>
  );
}
