/**
 * The numbers behind the Progress page (2026-11-22), pure so they can be
 * tested. Days are local calendar days, YYYY-MM-DD, as todayKey writes them.
 *
 *   answerDays  [{ day, answered, correct }] from my_answer_days (0093)
 *   activity    { day: count } — every answer, kept on the device too
 */
import { pctOf } from "./progress";

const DAY_MS = 86400000;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const atNoon = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
/* Monday is 0. */
const dow = d => (d.getDay() + 6) % 7;

function byDay(answerDays) {
  const m = new Map();
  for (const r of answerDays ?? []) m.set(String(r.day).slice(0, 10), { answered: Number(r.answered) || 0, correct: Number(r.correct) || 0 });
  return m;
}

/** This week, Monday to Sunday, each day with right and wrong. Days after
    today are marked future. Falls back to activity counts (all "right" is
    wrong, so they go in `answered` with no split) when the server's days are
    not there. */
export function weekDays(answerDays, activity = {}, today = key(new Date())) {
  const m = byDay(answerDays);
  const t = atNoon(today);
  const monday = addDays(t, -dow(t));
  return WEEKDAYS.map((label, i) => {
    const d = addDays(monday, i);
    const k = key(d);
    const r = m.get(k);
    const answered = r ? r.answered : Number(activity[k]) || 0;
    const correct = r ? r.correct : null;
    return { day: k, label, answered, correct, today: k === today, future: k > today };
  });
}

/** Totals over a run of days ending on `end` (inclusive). */
function span(m, end, days) {
  let answered = 0, correct = 0;
  const e = atNoon(end);
  for (let i = 0; i < days; i++) {
    const r = m.get(key(addDays(e, -i)));
    if (r) { answered += r.answered; correct += r.correct; }
  }
  return { answered, correct, pct: answered ? Math.round((correct / answered) * 100) : null };
}

/** Accuracy for each of the last `weeks` weeks (Monday-start), oldest first.
    A week with fewer than `min` answers has pct null and is not drawn. */
export function weeklyAccuracy(answerDays, today = key(new Date()), weeks = 10, min = 20) {
  const m = byDay(answerDays);
  const t = atNoon(today);
  const thisMonday = addDays(t, -dow(t));
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(thisMonday, -7 * w);
    const end = w === 0 ? t : addDays(start, 6);
    const days = Math.round((end - start) / DAY_MS) + 1;
    const s = span(m, key(end), days);
    out.push({ start: key(start), answered: s.answered, pct: s.answered >= min ? s.pct : null });
  }
  return out;
}

/** The band's first sentence: this week's accuracy, and how it compares
    with the same seven days four weeks ago, when both have enough behind
    them. Null when this week has too little to say anything. */
export function headline(answerDays, today = key(new Date()), min = 20) {
  const m = byDay(answerDays);
  const now = span(m, today, 7);
  if (now.answered < min) return null;
  const then = span(m, key(addDays(atNoon(today), -28)), 7);
  if (then.answered < min) return `${now.pct}% right this week.`;
  const d = now.pct - then.pct;
  if (d === 0) return `${now.pct}% right this week, the same as a month ago.`;
  return `${now.pct}% right this week, ${d > 0 ? "up" : "down"} ${Math.abs(d)} point${Math.abs(d) === 1 ? "" : "s"} on a month ago.`;
}

/** One line under This week: against last week, and the biggest day. */
export function weekLine(week, answerDays, activity = {}, today = key(new Date())) {
  const m = byDay(answerDays);
  const total = week.reduce((a, d) => a + d.answered, 0);
  const t = atNoon(today);
  const lastMonday = addDays(t, -dow(t) - 7);
  let last = 0;
  for (let i = 0; i < 7; i++) {
    const k = key(addDays(lastMonday, i));
    last += m.get(k)?.answered ?? (Number(activity[k]) || 0);
  }
  const parts = [];
  if (total && last) {
    const d = total - last;
    parts.push(d === 0 ? "The same as last week." : `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than last week.`);
  } else if (total && !last) parts.push("Nothing last week, so that's all new.");
  const best = week.reduce((a, d) => (d.answered > (a?.answered ?? 0) ? d : a), null);
  if (best && week.filter(d => d.answered > 0).length > 1) {
    parts.push(best.today ? "Today is your biggest day." : `${FULL_DAYS[WEEKDAYS.indexOf(best.label)].replace(/s$/, "")} was your biggest day.`);
  }
  return parts.join(" ");
}

/** The calendar: `weeks` columns of Monday-to-Sunday, ending this week.
    Levels 0–4 by how many answers that day; future days are null. */
export function calendar(activity = {}, today = key(new Date()), weeks = 16) {
  const t = atNoon(today);
  const first = addDays(t, -dow(t) - 7 * (weeks - 1));
  const cells = [];
  let studied = 0, total = 0;
  const perDow = new Array(7).fill(0);
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(first, i);
    const k = key(d);
    if (k > today) { cells.push(null); continue; }
    total += 1;
    const n = Number(activity[k]) || 0;
    if (n > 0) { studied += 1; perDow[dow(d)] += n; }
    cells.push({ day: k, n, level: n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : n < 60 ? 3 : 4, today: k === today });
  }
  const top = perDow.indexOf(Math.max(...perDow));
  const months = [];
  for (let w = 0; w < weeks; w++) {
    const d = addDays(first, w * 7);
    const name = d.toLocaleDateString("en-GB", { month: "short" });
    if (!months.length || months[months.length - 1].name !== name) months.push({ name, week: w });
  }
  return { cells, studied, total, mostActive: studied ? FULL_DAYS[top] : null, months };
}

/** The weakest decks with nothing under them, with enough answers to judge:
    lowest accuracy first. Each carries the name of the deck it sits in
    ("Renal"), not the top of the tree, which for ready-made decks is just
    "Year 2". */
export function weakest(roots, n = 5, min = 10) {
  const out = [];
  const walk = (node, parent) => {
    if (!node.children.length) {
      const pct = pctOf(node);
      if (pct !== null && node.attempts >= min && pct < 100) out.push({ node, root: (parent ?? node).name, pct });
      return;
    }
    for (const c of node.children) walk(c, node);
  };
  for (const r of roots) walk(r, null);
  return out.sort((a, b) => a.pct - b.pct || b.node.attempts - a.node.attempts).slice(0, n);
}

/** Where you are on your year's board this week. Rows from leaderboard_week;
    only people who answered something count. */
export function yearStanding(rows, userId) {
  const live = (rows ?? []).filter(r => Number(r.week_count) > 0);
  const i = live.findIndex(r => r.user_id === userId);
  if (i < 0) return { onBoard: false, people: live.length };
  const me = live[i];
  const people = live.length;
  const mine = Number(me.week_count);
  const counts = live.map(r => Number(r.week_count));
  /* Top or bottom share of the year, whichever half you are in (Rafil,
     2026-11-23). Counted from those who answered more (or fewer) than you,
     so people level with you share a place. */
  const top = Math.ceil((100 * (counts.filter(c => c > mine).length + 1)) / people);
  const bottom = Math.ceil((100 * (counts.filter(c => c < mine).length + 1)) / people);
  const share = top <= bottom ? { side: "top", pct: top } : { side: "bottom", pct: bottom };
  const sorted = [...counts].sort((a, b) => a - b);
  const mid = Math.floor(people / 2);
  return {
    onBoard: true,
    rank: Number(me.rank) || i + 1,
    people,
    mine,
    /* The bar's average is the middle student's count, the median, because
       it sits at 50% of a bottom-to-top bar (Rafil, 2026-11-23: the
       average in the middle). The mean would not: a few students on
       hundreds pull it past most of the year (118 against 83 for Year 2). */
    avg: people % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2),
    share,
    /* You sit where your share puts you: top 38% is 62%. */
    at: share.side === "top" ? 100 - share.pct : share.pct,
  };
}

/** Which way the Your year bar's "You" label reads from the end of your
    fill: away from the average in the middle, turning inwards near an end. */
export function youLabel(at, room = 15) {
  return at < 50 ? (at < room ? "start" : "end") : (at > 100 - room ? "end" : "start");
}

export const ordinal = n => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
