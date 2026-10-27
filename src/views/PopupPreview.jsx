import { useEffect, useState } from "react";
import SessionSummary from "../ui/SessionSummary";
import Dashboard from "./Dashboard";
import QuizShell from "../ui/QuizShell";
import {
  DayOneNudge, MilestoneNudge, PassedNudge, BestNudge, ImproveNudge, LeaderNudge,
  HomeScreenNudge, InviteNudge, StreakNudge,
} from "../ui/Nudges";
import { todayKey, yesterdayKey } from "../lib/storage";

/**
 * Each popup on the screen it actually appears on (Admin > Popups,
 * 2026-10-27). Loaded in its own frame at a real phone or laptop width,
 * so the layout is the one a student gets, not a laptop page squeezed
 * into a box. Sample data only; nothing is read or written.
 *
 *   ?popup-preview=<kind>&v=<variant>
 */

const QS = [
  ["Which part of the nephron is impermeable to water but actively reabsorbs sodium chloride?", ["Collecting duct", "Descending limb of the loop of Henle", "Proximal convoluted tubule", "Thick ascending limb of the loop of Henle", "Vasa recta"], 3],
  ["Which hormone acts on the principal cells of the collecting duct to insert aquaporin-2 channels?", ["Aldosterone", "Antidiuretic hormone", "Atrial natriuretic peptide", "Parathyroid hormone", "Renin"], 1],
  ["Where do epididymal cysts typically occur within the scrotum?", ["Body of the epididymis", "Head of the epididymis", "Spermatic cord", "Tail of the epididymis", "Tunica vaginalis"], 1],
  ["Which complement component deficiency predisposes to recurrent Neisseria infections?", ["C1 inhibitor", "C2", "C3", "C5–C9", "Factor H"], 3],
  ["What is the first-line investigation for a suspected testicular tumour?", ["CT abdomen", "Scrotal ultrasound", "Serum AFP alone", "Testicular biopsy", "Urine dipstick"], 1],
  ["Which vessel does the left testicular vein drain into?", ["Inferior vena cava", "Left common iliac vein", "Left internal iliac vein", "Left renal vein", "Portal vein"], 3],
].map(([q, opts, ans], i) => ({
  id: 9_000_000 + i, q, opts, ans, exp: "", optExp: [],
  path: [{ id: "p1", name: "Renal" }, { id: "p2", name: "Anatomy" }], cat: "Anatomy", block: "Renal", deck: "Anatomy",
}));

const RESULTS = [...Array(20)].map((_, i) => {
  const q = QS[i % QS.length];
  const wrong = i % 5 === 2;
  return { id: q.id + i * 10, q: q.q, cat: i % 3 ? "Renal" : "Anatomy", correct: !wrong, correctAnswer: q.opts[q.ans], yourAnswer: q.opts[wrong ? (q.ans + 1) % 5 : q.ans] };
});

const ME = { user_id: "me", display_name: "You", week_count: 212, rank: 4 };
const RIVAL = { user_id: "r", display_name: "Omar Arif", week_count: 249, rank: 3 };
const BEHIND = { user_id: "b", display_name: "Zain Ahmed", week_count: 168, rank: 5 };
const f = () => {};

function rewardFor(kind, v) {
  const p = { inline: true, onAction: f, onClose: f };
  switch (kind) {
    case "dayone": return <DayOneNudge {...p} />;
    case "milestone": return <MilestoneNudge {...p} n={Number(v) || 500} />;
    case "passed": return <PassedNudge {...p} me={{ ...ME, week_count: 255 }} them={RIVAL} rank={3} />;
    case "best": return <BestNudge {...p} today={92} best={64} />;
    case "improve": return <ImproveNudge {...p} deck="Renal" before={54} after={78} />;
    case "leader": return <LeaderNudge {...p} me={ME} rival={RIVAL} rank={4} around={[RIVAL, ME, BEHIND]} />;
    case "home": return <HomeScreenNudge {...p} onDone={f} forceKind={v || "ios"} />;
    case "invite": return <InviteNudge {...p} me={{ name: "You" }} />;
    default: return null;
  }
}
/* On the results page these drop their button; the page has Practice again. */
const QUIET = new Set(["milestone", "passed", "best", "improve", "leader"]);

/* A quiz that gets its 5th in a row right, again every few seconds, so
   the pop can be watched without pressing Replay. */
const QUEUE = [...Array(20)].map((_, i) => ({ ...QS[i % QS.length], id: 9_100_000 + i }));
function ComboScreen() {
  const [n, setN] = useState(4);
  useEffect(() => {
    let t2;
    const hit = () => { setN(4); t2 = setTimeout(() => setN(5), 350); };
    const t1 = setTimeout(hit, 600);
    const loop = setInterval(hit, 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(loop); };
  }, []);
  const results = {}, sels = {};
  for (let i = 0; i < n; i++) { results[i] = { correct: true }; sels[i] = QUEUE[i].ans; }
  return (
    <QuizShell q={QUEUE[n]} idx={n} queue={QUEUE} sel={null} sels={sels} results={results}
      isBookmarked={false} isLast={false} onAnswer={f} onNext={f} onPrev={f} onJump={f}
      onToggleBookmark={f} onSaveEdit={f} onRequestExit={f} />
  );
}

function HomeScreen() {
  const today = todayKey();
  const activity = {};
  for (let i = 1; i <= 6; i++) { const d = new Date(); d.setDate(d.getDate() - i); activity[d.toISOString().slice(0, 10)] = 20 + i * 3; }
  activity[today] = 0;
  return (
    <>
      <Dashboard pStats={{}} streak={{ streak: 6, lastDate: yesterdayKey() }} dueCount={12} setView={f}
        activity={activity} srCards={{}} dailyGoal={20} studySeconds={5400} onGoalChange={f} onStudy={f} />
      <StreakNudge days={6} onAction={f} onClose={f} />
    </>
  );
}

export default function PopupPreview() {
  const p = new URLSearchParams(location.search);
  const kind = p.get("popup-preview");
  const v = p.get("v");
  if (kind === "combo") return <ComboScreen />;
  if (kind === "streak") return <HomeScreen />;
  const reward = rewardFor(kind, v);
  return (
    <SessionSummary title="Practice" results={RESULTS} onRestart={f} onChangeSettings={f} onDrillWrong={f} onOpenPast={f}
      reward={reward && <div className={`sum-reward__in${QUIET.has(kind) ? " is-quiet" : ""}`}>{reward}</div>} />
  );
}
