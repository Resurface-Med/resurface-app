import { useEffect, useMemo, useState } from "react";
import Dashboard from "./Dashboard";
import { QUESTIONS, loadDecks } from "../data";

/**
 * Public marketing preview of the real Dashboard — no auth, fixture progress.
 * Served at /preview/dashboard and framed by the landing hero laptop.
 */
function buildActivity() {
  const out = {};
  const now = new Date();
  for (let i = 0; i < 84; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dow = d.getDay();
    if (dow === 0) continue;
    if (dow === 6 && i % 3 !== 0) continue;
    const n = [0, 4, 8, 12, 18, 24, 31][(i * 7 + dow) % 7];
    if (n) out[key] = n;
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  out[today] = 14;
  return out;
}

function buildPStats(seen) {
  const out = {};
  for (let i = 0; i < seen; i++) {
    const id = QUESTIONS[i]?.id ?? `preview-${i}`;
    out[id] = { total: 2 + (i % 3), correct: 1 + (i % 2) };
  }
  return out;
}

function buildSrCards(mastered) {
  const out = {};
  for (let i = 0; i < mastered; i++) {
    const id = QUESTIONS[i]?.id ?? `preview-${i}`;
    out[id] = { interval: 21 + (i % 10), ease: 2.5, reps: 4 };
  }
  return out;
}

export default function DashboardPreview() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.add("is-dashboard-preview");
    loadDecks().then(() => setReady(true));
    return () => document.documentElement.classList.remove("is-dashboard-preview");
  }, []);

  const fixture = useMemo(() => {
    if (!ready) return null;
    const count = QUESTIONS.length || 142;
    const seenN = Math.min(142, count);
    const masteredN = Math.min(48, seenN);
    return {
      pStats: buildPStats(seenN),
      srCards: buildSrCards(masteredN),
      activity: buildActivity(),
      streak: { streak: 6, longest: 11, lastDate: null },
      dueCount: 12,
      dailyGoal: 20,
    };
  }, [ready]);

  if (!ready || !fixture) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--c-bg, #3562f5)" }}>
        <div style={{ color: "var(--c-on-field, #fff)", fontSize: 15, fontWeight: 500, opacity: 0.9 }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-preview">
      <Dashboard
        pStats={fixture.pStats}
        streak={fixture.streak}
        dueCount={fixture.dueCount}
        setView={() => {}}
        activity={fixture.activity}
        srCards={fixture.srCards}
        dailyGoal={fixture.dailyGoal}
        onGoalChange={() => {}}
        onStudy={() => {}}
      />
    </div>
  );
}
