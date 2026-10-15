// What's left of local storage.
//
// Study data lives in Postgres now (see lib/remote.js). Two things stay local:
// the theme, which has to be known before auth resolves so the page doesn't
// paint the wrong colour for a frame, and the failed-write queue in remote.js.
//
// Keys keep their historic pq_ prefix — it's invisible to users, and renaming
// it would strand the theme of anyone who has already set one.

const THEME_KEY = "pq_theme";

export const themeStore = {
  get: () => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; } },
  set: (t) => { try { localStorage.setItem(THEME_KEY, t); } catch {} },
};

/** Local calendar day, YYYY-MM-DD. Not UTC: the heatmap is drawn where you are. */
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Advances a streak for a day of study. Pure, so the caller can tell whether
 * anything changed: it returns the same object when today is already counted,
 * which is what lets callers skip a pointless write.
 */
/** The calendar day before, as a key. By date, not minus 24 hours: the day
    the clocks go forward is 23 hours long, and an hour of it came out as two
    days ago. */
export function yesterdayKey(d = new Date()) {
  return todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

/**
 * The streak as it stands today. The stored one only changes when you answer
 * something, so a streak that ended a week ago is still saved as its old
 * length — and was shown as alive ("12 days in a row") until the next answer
 * reset it. Studied today or yesterday it is still running; otherwise it is 0.
 */
export function liveStreak(s, d = new Date()) {
  if (!s) return { streak: 0, longest: 0, lastDate: null };
  const running = s.lastDate === todayKey(d) || s.lastDate === yesterdayKey(d);
  return running ? s : { ...s, streak: 0 };
}

export function nextStreak(prev) {
  const today = todayKey();
  if (prev.lastDate === today) return prev;

  const yesterday = yesterdayKey();
  const streak = prev.lastDate === yesterday ? (prev.streak || 0) + 1 : 1;
  return { streak, lastDate: today, longest: Math.max(streak, prev.longest || 0) };
}
