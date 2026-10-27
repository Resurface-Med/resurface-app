import { useCallback, useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import PopupPreview from "./PopupPreview";
import { QUESTIONS } from "../data";
import {
  fetchOverview, fetchOverviewDaily, fetchStorage, fetchPeople, fetchPeopleDaily, fetchGeneratedDaily,
  setAdmin, fetchFlags, clearFlags, fetchAiQuota, adminDeleteFeatured, fetchLeaderboardWeek,
} from "../lib/remote";
import EditQuestionModal from "../ui/EditQuestionModal";
import { persistFor } from "../lib/adminFeatured";
import { TrendChart, Spark } from "../ui/Chart";
import { confirm } from "../ui/Confirm";
import { StreakNudge, LeaderNudge, InviteNudge, MilestoneNudge, MILESTONES, HomeScreenNudge, ImproveNudge, DayOneNudge, ComboPreview, PassedNudge, BestNudge, showPreview } from "../ui/Nudges";

/**
 * Admin, redone for where Resurface is now (2026-10-26): a few dozen
 * students, one founder, and three questions asked every day. How is it
 * going? Who should I message? Is anything broken or about to be?
 *
 * Overview answers the first in four numbers and one chart you can scrub,
 * with who studied on the day you pick; then the people worth a message
 * (gone quiet, never started); then the limits that would stop the app
 * (AI allowances, storage). People is everyone, filterable, with their
 * emails a click away. Reported is the questions students flagged.
 *
 * Sharing, Resurface decks, Generating, AI usage and Mailing list were
 * folded in or dropped. Activity is its own tab: the calendar of who did what. Everything reads SECURITY DEFINER functions
 * that check the admins table themselves; nothing here is a permission.
 */

const REASONS = {
  "wrong-answer": "Wrong answer",
  "bad-explanation": "Explanation is off",
  "unclear": "Unclear wording",
  "duplicate": "Seen this already",
  "other": "Something else",
};

const DAY = 864e5;
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const dmy = iso => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const nf = n => Number(n || 0).toLocaleString("en-GB");
const daysSince = key => (key ? Math.floor((new Date(dayKey(Date.now())) - new Date(key)) / DAY) : null);
function ago(key) {
  const n = daysSince(key);
  if (n == null) return "Never";
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 14) return `${n} days ago`;
  return dmy(key);
}
const nameOf = p => p.display_name || p.email?.split("@")[0] || "Unknown";

/** Where someone stands, from when they last studied and on how many days. */
function statusOf(p) {
  const since = daysSince(p.last_active);
  if (!Number(p.answered)) return "new";
  if (since != null && since < 7) return "active";
  if (Number(p.active_days) >= 2) return "quiet";
  return "tried";
}
const STATUS = {
  active: { label: "Active", hint: "Studied in the last 7 days" },
  quiet: { label: "Gone quiet", hint: "Studied on 2 or more days, nothing for a week" },
  tried: { label: "Tried once", hint: "Studied on one day, nothing since" },
  new: { label: "Not started", hint: "Hasn't answered a question" },
};

/** Loads when its tab is opened. */
function useSection(load) {
  const [state, setState] = useState({ rows: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    load()
      .then(rows => { if (!cancelled) setState({ rows, error: "" }); })
      .catch(err => { if (!cancelled) setState({ rows: null, error: err.message || "Couldn’t load that." }); });
    return () => { cancelled = true; };
  }, [load]);
  return [state, setState];
}

function Empty({ children }) {
  return <p className="ax-empty">{children}</p>;
}

function CopyEmails({ people, label = "Copy emails" }) {
  const [done, setDone] = useState(false);
  if (!people.length) return null;
  async function copy() {
    const list = people.map(p => p.email).filter(Boolean).join(", ");
    try { await navigator.clipboard.writeText(list); setDone(true); setTimeout(() => setDone(false), 1600); }
    catch { window.prompt("Copy these", list); }
  }
  return <button type="button" className="ax-link" onClick={copy}>{done ? "Copied" : label}</button>;
}

/* ── Overview ─────────────────────────────────────────────────────── */

const METRICS = [
  { k: "active", label: "Studying", unit: "people", sub: "people this week" },
  { k: "answers", label: "Questions answered", unit: "answered", sub: "this week" },
  { k: "accounts", label: "Sign-ups", unit: "sign-ups", sub: "this week" },
  { k: "generated", label: "Questions generated", unit: "generated", sub: "this week" },
];

function Delta({ now, before }) {
  const d = Number(now) - Number(before);
  if (!Number(before) && !Number(now)) return <span className="ax-delta">—</span>;
  if (d === 0) return <span className="ax-delta">Same as last week</span>;
  const pct = Number(before) ? Math.round((d / Number(before)) * 100) : null;
  return (
    <span className={`ax-delta ${d > 0 ? "is-up" : "is-down"}`}>
      {d > 0 ? "↑" : "↓"} {pct != null ? `${Math.abs(pct)}%` : nf(Math.abs(d))} on last week
    </span>
  );
}

/* What the chart can show. Each is one line per day over the range;
   "Answers per person" and "Total accounts" are worked out from the others. */
const SERIES = [
  { k: "active", label: "Studying", unit: "studying", title: "People studying per day" },
  { k: "answers", label: "Answered", unit: "answered", title: "Questions answered per day" },
  { k: "per", label: "Per person", unit: "per person", title: "Questions answered per person studying" },
  { k: "accounts", label: "Sign-ups", unit: "sign-ups", title: "Sign-ups per day" },
  { k: "total", label: "Total accounts", unit: "accounts", title: "Total accounts" },
  { k: "generated", label: "Generated", unit: "generated", title: "Questions generated per day" },
];

function Overview() {
  const [totals] = useSection(fetchOverview);
  const [range, setRange] = useState(30);
  const loadDaily = useCallback(() => fetchOverviewDaily(range), [range]);
  const [daily] = useSection(loadDaily);
  const [show, setShow] = useState("active");
  const [picked, setPicked] = useState(null);

  const { days, series } = useMemo(() => {
    const series = new Map();
    const days = [];
    for (const r of daily.rows ?? []) {
      if (!series.has(r.key)) series.set(r.key, []);
      series.get(r.key).push(Number(r.value) || 0);
      if (r.key === "accounts") days.push(String(r.day).slice(0, 10));
    }
    const active = series.get("active") ?? [], answers = series.get("answers") ?? [];
    series.set("per", answers.map((n, i) => (active[i] ? Math.round((n / active[i]) * 10) / 10 : 0)));
    /* Running total: everyone before the window, then each day's sign-ups. */
    const signups = series.get("accounts") ?? [];
    const all = Number((totals.rows ?? []).find(r => r.key === "accounts")?.total ?? 0);
    let run = Math.max(0, all - signups.reduce((x, y) => x + y, 0));
    series.set("total", signups.map(n => (run += n)));
    return { days, series };
  }, [daily.rows, totals.rows]);

  if (totals.error) return <Empty>{totals.error}</Empty>;
  if (!totals.rows) return <Empty>&nbsp;</Empty>;
  const row = k => totals.rows.find(r => r.key === k) ?? { last7: 0, prev7: 0 };
  const chosen = SERIES.find(x => x.k === show);

  return (
    <>
      <Limits />
      <div className="ax-metrics">
        {METRICS.map(m => (
          <div key={m.k} className="ax-metric">
            <span className="ax-metric__label">{m.label}</span>
            <span className="ax-metric__value">{nf(row(m.k).last7)}</span>
            <span className="ax-metric__sub">{m.sub}</span>
            <Delta now={row(m.k).last7} before={row(m.k).prev7} />
          </div>
        ))}
      </div>

      <section className="ax-chart">
        <div className="ax-chart__head">
          <h3 className="ax-h3">{chosen.title}</h3>
          <div className="ax-range" role="group" aria-label="Range">
            {[30, 90].map(n => (
              <button key={n} type="button" aria-pressed={range === n}
                className={range === n ? "is-on" : ""} onClick={() => { setRange(n); setPicked(null); }}>{n} days</button>
            ))}
          </div>
        </div>
        <div className="ax-series" role="tablist" aria-label="What the chart shows">
          {SERIES.map(x => (
            <button key={x.k} type="button" role="tab" aria-selected={show === x.k}
              className={`ax-filter${show === x.k ? " is-on" : ""}`} onClick={() => { setShow(x.k); setPicked(null); }}>{x.label}</button>
          ))}
        </div>
        {daily.error ? <Empty>{daily.error}</Empty> : !daily.rows ? <div className="ax-chart__ph" /> : (
          <TrendChart points={series.get(show) ?? []} days={days} unit={chosen.unit}
            picked={picked != null && picked < days.length ? picked : null} onPick={setPicked} />
        )}
      </section>
    </>
  );
}

/* What would stop the app if it ran out, in one strip at the top: the two
   daily AI allowances (500 requests each, reset 8am here) and the free
   database's 500 MB. Red when one gets close. */
function Meter({ label, used, of, fmt = nf, sub, warnAt = 0.8 }) {
  const pct = Math.min(100, (used / of) * 100);
  const high = used >= of * warnAt;
  return (
    <div className={`ax-limit${high ? " is-high" : ""}`}>
      <span className="ax-metric__label">{label}</span>
      <span className="ax-metric__value">{fmt(used)}</span>
      <span className="ax-metric__sub">of {fmt(of)}{sub ? ` · ${sub}` : ""}</span>
      <span className="ax-limit__bar" aria-hidden="true"><span style={{ width: `${Math.max(pct, 1.5)}%` }} /></span>
    </div>
  );
}
function Limits() {
  const [quota] = useSection(fetchAiQuota);
  const [size] = useSection(fetchStorage);
  const q = quota.rows ?? {};
  const resets = q.resets_at ? new Date(q.resets_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }) : "8:00";
  const MB = 1024 * 1024;
  const mb = b => `${Math.round(b / MB)} MB`;
  return (
    <section className="ax-limits" aria-label="Limits">
      {!quota.error && <Meter label="Generating today" used={Number(q.generate ?? 0)} of={500} sub={`resets ${resets}`} />}
      {!quota.error && <Meter label="Resurface AI today" used={Number(q.explain ?? 0)} of={500} sub={`resets ${resets}`} />}
      {!size.error && size.rows != null && (
        <Meter label="Database" used={size.rows} of={500 * MB} fmt={mb} warnAt={0.6}
          sub={size.rows >= 300 * MB ? "over 60%: shorten history or move to Pro" : "free plan"} />
      )}
    </section>
  );
}

/* ── Activity ─────────────────────────────────────────────────────────
   Who studied, signed up or generated on a day: a month at a time, Monday
   first, back through six months, with the day's people beside it. The
   day is the student's own local day. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAL_SPAN = 180;
const parseDay = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
function monthCells(year, month) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= count; d += 1) cells.push(dayKey(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
const dayTitle = key => parseDay(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const MODES = [
  { k: "studied", label: "Studied", none: "Nobody answered a question.", col: "Answered" },
  { k: "signed", label: "Signed up", none: "Nobody signed up.", col: "Answered since" },
  { k: "generated", label: "Generated", none: "Nobody generated a question.", col: "Generated" },
];

function Activity() {
  const [{ rows, error }] = useSection(fetchPeople);
  const loadDaily = useCallback(() => fetchPeopleDaily(CAL_SPAN + 2), []);
  const [daily] = useSection(loadDaily);
  const loadGen = useCallback(() => fetchGeneratedDaily(CAL_SPAN + 2), []);
  const [generated] = useSection(loadGen);
  const today = dayKey(Date.now());
  const todayDate = parseDay(today);
  const earliest = parseDay(dayKey(Date.now() - (CAL_SPAN - 1) * DAY));
  const earliestKey = dayKey(earliest);
  const [cursor, setCursor] = useState({ y: todayDate.getFullYear(), m: todayDate.getMonth() });
  const [day, setDay] = useState(today);
  const [mode, setMode] = useState("studied");
  const cells = useMemo(() => monthCells(cursor.y, cursor.m), [cursor]);
  const at = cursor.y * 12 + cursor.m;
  const canPrev = at > earliest.getFullYear() * 12 + earliest.getMonth();
  const canNext = at < todayDate.getFullYear() * 12 + todayDate.getMonth();

  const index = rowsIn => {
    const all = new Map();
    for (const r of rowsIn ?? []) {
      const key = String(r.day).slice(0, 10);
      if (!all.has(key)) all.set(key, new Map());
      all.get(key).set(r.user_id, Number(r.answers ?? r.questions) || 0);
    }
    return all;
  };
  const studiedBy = useMemo(() => index(daily.rows), [daily.rows]);
  const generatedBy = useMemo(() => index(generated.rows), [generated.rows]);
  const signedBy = useMemo(() => {
    const all = new Map();
    for (const p of rows ?? []) {
      const key = dayKey(p.joined);
      if (!all.has(key)) all.set(key, new Map());
      all.get(key).set(p.user_id, Number(p.answered) || 0);
    }
    return all;
  }, [rows]);
  const source = mode === "signed" ? signedBy : mode === "generated" ? generatedBy : studiedBy;
  const countOn = key => source.get(key)?.size ?? 0;

  const byId = useMemo(() => new Map((rows ?? []).map(p => [p.user_id, p])), [rows]);
  const list = [...(source.get(day) ?? new Map())]
    .map(([id, n]) => ({ p: byId.get(id), n })).filter(x => x.p)
    .sort((a, b) => b.n - a.n || nameOf(a.p).localeCompare(nameOf(b.p)));
  const total = list.reduce((a, x) => a + x.n, 0);
  const m = MODES.find(x => x.k === mode);

  if (error || daily.error) return <Empty>{error || daily.error}</Empty>;
  if (!rows || !daily.rows) return <Empty>&nbsp;</Empty>;

  return (
    <>
      <div className="ax-filters" role="tablist" aria-label="Show">
        {MODES.map(x => (
          <button key={x.k} type="button" role="tab" aria-selected={mode === x.k}
            className={`ax-filter${mode === x.k ? " is-on" : ""}`} onClick={() => setMode(x.k)}>{x.label}</button>
        ))}
      </div>
      <div className="ax-act">
        <section className="ax-cal">
          <div className="ax-cal__bar">
            <h3 className="ax-cal__month">{new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h3>
            <span className="ax-cal__nav">
              <button type="button" aria-label="Previous month" disabled={!canPrev}
                onClick={() => setCursor(c => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>‹</button>
              <button type="button" aria-label="Next month" disabled={!canNext}
                onClick={() => setCursor(c => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>›</button>
            </span>
          </div>
          <div className="ax-cal__grid" role="listbox" aria-label="Day">
            {WEEKDAYS.map(w => <span key={w} className="ax-cal__wd">{w}</span>)}
            {cells.map((key, i) => {
              if (!key) return <span key={`gap-${i}`} />;
              const open = key >= earliestKey && key <= today;
              const n = open ? countOn(key) : 0;
              return (
                <button key={key} type="button" role="option" aria-selected={key === day} disabled={!open}
                  aria-label={`${dayTitle(key)}, ${n}`}
                  className={`ax-cal__day${key === day ? " is-on" : ""}${key === today ? " is-today" : ""}${!open ? " is-out" : n ? "" : " is-zero"}`}
                  onClick={() => open && setDay(key)}>
                  <span className="ax-cal__n">{parseDay(key).getDate()}</span>
                  {n > 0 && <span className="ax-cal__c">{n}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section className="ax-act__day">
          <h3 className="ax-act__title">{day === today ? "Today" : dayTitle(day)}</h3>
          {day === today && <p className="ax-note">{dayTitle(day)}</p>}
          <div className="ax-act__stats">
            <span><strong>{list.length}</strong> {mode === "signed" ? (list.length === 1 ? "sign-up" : "sign-ups") : list.length === 1 ? "person" : "people"}</span>
            {mode !== "signed" && <span><strong>{nf(total)}</strong> {mode === "generated" ? "generated" : "answered"}</span>}
          </div>
          {mode === "generated" && generated.error ? <Empty>{generated.error}</Empty> : list.length === 0 ? <p className="ax-quiet">{m.none}</p> : (
            <ul className="ax-rows">
              {list.map(({ p, n }) => (
                <li key={p.user_id}>
                  <span className="ax-who">{nameOf(p)}{p.study_year ? <span className="ax-year">Y{p.study_year}</span> : null}</span>
                  <span className={mode === "signed" && !n ? "ax-meta" : "ax-num"}>{mode === "signed" && !n ? "Not started" : nf(n)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/* ── People ───────────────────────────────────────────────────────── */

function SortTh({ k, sort, onSort, num, children }) {
  return (
    <th className={num ? "ax-num" : undefined}>
      <button type="button" className={`ax-sort${sort === k ? " is-on" : ""}`} onClick={() => onSort(k)}>{children}</button>
    </th>
  );
}

const FILTERS = [
  { k: "all", label: "Everyone", test: () => true },
  { k: "active", label: "Active", test: p => statusOf(p) === "active" },
  { k: "quiet", label: "Gone quiet", test: p => statusOf(p) === "quiet" },
  { k: "tried", label: "Tried once", test: p => statusOf(p) === "tried" },
  { k: "new", label: "Not started", test: p => statusOf(p) === "new" },
  { k: "mail", label: "Mailing list", test: p => p.marketing },
];

function People() {
  const [{ rows, error }, setState] = useSection(fetchPeople);
  const loadDaily = useCallback(() => fetchPeopleDaily(30), []);
  const [daily] = useSection(loadDaily);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("seen");
  const [busy, setBusy] = useState(null);

  const trend = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) days.push(dayKey(Date.now() - i * DAY));
    const index = new Map(days.map((d, i) => [d, i]));
    const by = new Map();
    for (const r of daily.rows ?? []) {
      if (!by.has(r.user_id)) by.set(r.user_id, Array(30).fill(0));
      const i = index.get(String(r.day).slice(0, 10));
      if (i != null) by.get(r.user_id)[i] = Number(r.answers) || 0;
    }
    return by;
  }, [daily.rows]);
  const week = useMemo(() => {
    const m = new Map();
    for (const [id, pts] of trend) m.set(id, pts.slice(-7).reduce((a, b) => a + b, 0));
    return m;
  }, [trend]);

  async function toggleAdmin(p) {
    const making = !p.is_admin;
    if (!making && !await confirm({ title: `Remove ${nameOf(p)} as an admin?`, body: "They lose the Admin tab and everything behind it.", action: "Remove", danger: true })) return;
    if (making && !await confirm({ title: `Make ${nameOf(p)} an admin?`, body: "They’ll see this page, including everyone’s email address.", action: "Make admin" })) return;
    setBusy(p.user_id);
    try {
      await setAdmin(p.user_id, making);
      setState(s => ({ ...s, rows: s.rows.map(r => (r.user_id === p.user_id ? { ...r, is_admin: making } : r)) }));
    } finally { setBusy(null); }
  }

  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;

  const f = FILTERS.find(x => x.k === filter);
  const q = query.trim().toLowerCase();
  const shown = rows.filter(f.test).filter(p => !q || [p.display_name, p.email].some(t => (t ?? "").toLowerCase().includes(q)));
  const sorted = [...shown].sort((a, b) =>
    sort === "seen" ? String(b.last_active ?? "").localeCompare(String(a.last_active ?? ""))
    : sort === "week" ? (week.get(b.user_id) ?? 0) - (week.get(a.user_id) ?? 0)
    : sort === "total" ? Number(b.answered) - Number(a.answered)
    : String(b.joined).localeCompare(String(a.joined)));

  return (
    <>
      <div className="ax-filters" role="tablist" aria-label="Show">
        {FILTERS.map(x => (
          <button key={x.k} type="button" role="tab" aria-selected={filter === x.k}
            className={`ax-filter${filter === x.k ? " is-on" : ""}`} onClick={() => setFilter(x.k)}>
            {x.label}<span>{rows.filter(x.test).length}</span>
          </button>
        ))}
      </div>
      <div className="ax-toolbar">
        <input className="ax-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names and emails" aria-label="Search" />
        <CopyEmails people={shown} label={`Copy ${shown.length} ${shown.length === 1 ? "email" : "emails"}`} />
      </div>
      {filter !== "all" && filter !== "mail" && <p className="ax-note">{STATUS[filter]?.hint}.</p>}

      {sorted.length === 0 ? <Empty>Nobody here.</Empty> : (
        <table className="ax-table">
          <thead>
            <tr>
              <th>Person</th>
              <SortTh sort={sort} onSort={setSort} k="joined">Joined</SortTh>
              <SortTh sort={sort} onSort={setSort} k="seen">Last studied</SortTh>
              <SortTh sort={sort} onSort={setSort} k="week" num>This week</SortTh>
              <SortTh sort={sort} onSort={setSort} k="total" num>Answered</SortTh>
              <th className="ax-trend">Last 30 days</th>
              <th><span className="sr-only">Admin</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const st = statusOf(p);
              return (
                <tr key={p.user_id}>
                  <th scope="row">
                    <span className="ax-person">
                      <span className={`ax-dot is-${st}`} title={STATUS[st].label} aria-label={STATUS[st].label} />
                      <span>
                        <span className="ax-name">
                          {nameOf(p)}
                          {p.study_year ? <span className="ax-year">Year {p.study_year}</span> : null}
                          {p.is_admin && <span className="ax-year">Admin</span>}
                        </span>
                        <span className="ax-email">{p.email}</span>
                      </span>
                    </span>
                  </th>
                  <td className="ax-dim">{dmy(p.joined)}</td>
                  <td className={p.last_active ? "" : "ax-dim"}>{ago(p.last_active)}</td>
                  <td className="ax-num">{nf(week.get(p.user_id) ?? 0)}</td>
                  <td className="ax-num ax-dim">{nf(p.answered)}</td>
                  <td className="ax-trend"><Spark points={trend.get(p.user_id) ?? Array(30).fill(0)} /></td>
                  <td className="ax-row-act">
                    <button type="button" className="ax-link" disabled={busy === p.user_id} onClick={() => toggleAdmin(p)}>
                      {busy === p.user_id ? "…" : p.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

/* ── Reported ─────────────────────────────────────────────────────── */

function FlagRow({ row, index, onCleared }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edits, bump] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const q = useMemo(() => QUESTIONS.find(x => x.id === row.question_id), [row.question_id, edits]);
  const notes = (row.notes ?? []).filter(n => String(n || "").trim());
  const reporters = Array.isArray(row.reporters) ? row.reporters : [];
  const where = q?.path?.map(p => p.name).join(" › ");

  async function clear() {
    if (!await confirm({
      title: "Clear these flags?",
      body: "The question stays as it is — this only marks the reports as dealt with.",
      action: "Clear",
    })) return;
    setBusy(true);
    try { await clearFlags(row.question_id); onCleared(row.question_id); }
    finally { setBusy(false); }
  }

  /* A reported Resurface question can be fixed or removed from here; the
     change goes into the deck itself, for everyone. */
  async function remove() {
    if (!await confirm({
      title: "Delete this question?",
      body: "It is removed from the Resurface deck for everyone, and from its owner’s deck too.",
      action: "Delete", danger: true,
    })) return;
    setBusy(true);
    try { await adminDeleteFeatured([row.question_id]); await clearFlags(row.question_id); onCleared(row.question_id); }
    finally { setBusy(false); }
  }

  return (
    <li className="flagq" data-in="rise" style={{ "--i": index }}>
      {editing && q && (
        <EditQuestionModal q={q} persist={persistFor(q)}
          onClose={() => setEditing(false)} onSave={() => { setEditing(false); bump(n => n + 1); }} />
      )}
      <div className="flagq__head">
        <span className="flagq__count">{row.flags} {Number(row.flags) === 1 ? "report" : "reports"}</span>
        <span className="flagq__reasons">{(row.reasons ?? []).map(r => REASONS[r] ?? r).join(" · ")}</span>
        <span className="flagq__acts">
          {(q?.featured || q?.gen) && <button type="button" className="gen-link" onClick={() => setEditing(true)} disabled={busy}>Edit question</button>}
          {q?.featured && <button type="button" className="gen-link adm-danger-link" onClick={remove} disabled={busy}>Delete</button>}
          <button type="button" className="gen-link" onClick={clear} disabled={busy}>
            {busy ? "…" : "Mark as dealt with"}
          </button>
        </span>
      </div>
      <p className="flagq__stem">
        {q ? q.q : <span className="flagq__missing">Question #{row.question_id} — not in the bank on this device</span>}
      </p>
      {where && <p className="flagq__where">{where}</p>}
      {reporters.length > 0 ? (
        <>
        <p className="flagq__who-label">Reported by</p>
        <ul className="flagq__who">
          {reporters.map((p, i) => (
            <li key={`${p.email || "report"}-${i}`}>
              <span className="flagq__who-name">{p.name || <span className="adm-dim">No name yet</span>}</span>
              {p.email && <span className="flagq__who-email">{p.email}</span>}
              {p.note && <span className="flagq__who-note">“{p.note}”</span>}
            </li>
          ))}
        </ul>
        </>
      ) : notes.length > 0 && (
        <ul className="flagq__notes">{notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>
      )}
    </li>
  );
}

function Flags({ onCount }) {
  const [{ rows, error }, setState] = useSection(fetchFlags);
  useEffect(() => { if (rows) onCount?.(rows.length); }, [rows, onCount]);
  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  if (rows.length === 0) return <Empty>Nothing reported. A question shows up here when a student reports it.</Empty>;
  return (
    <ul className="flagq-list">
      {rows.map((r, i) => (
        <FlagRow key={r.question_id} row={r} index={i}
          onCleared={id => setState(s => ({ ...s, rows: s.rows.filter(x => x.question_id !== id) }))} />
      ))}
    </ul>
  );
}

/* ── Popups ─────────────────────────────────────────────────────────
   Every popup a student can get, to look at without waiting for the
   moment it's for. The nudges are drawn here as they appear; "Show" puts
   the real one up over the page. Nothing here saves anything. */
const SAMPLE_ME = { user_id: "me", display_name: "You", week_count: 212, rank: 4 };
const SAMPLE_RIVAL = { user_id: "rival", display_name: "Omar Arif", week_count: 249, rank: 3 };
const SAMPLE_BEHIND = { user_id: "behind", display_name: "Zain A", week_count: 168, rank: 5 };

/* A popup on the screen it really appears on (views/PopupPreview), drawn
   at the size of the screen Admin is open on and scaled into a box. The
   layout follows the real window, so a box can't fake a phone on a laptop:
   open Admin on a phone to see the phone version. The transform makes the
   box the frame for anything fixed-position inside it (the quiz screen, a
   floating card), so nothing escapes onto the Admin page. */
function ScreenFrame({ kind, v }) {
  const box = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const W = window.innerWidth, H = Math.min(window.innerHeight, 900);
  const k = Math.min(1, Math.max(0, w - 24) / W);
  return (
    <div ref={box} className="pp-frame-box">
      {w > 0 && (
        <div className="pp-frame" style={{ width: W * k, height: H * k }}>
          <div className="pp-frame__vp" style={{ width: W, height: H, transform: `scale(${k})`, "--app-vh": `${H}px` }}>
            <PopupPreview kind={kind} v={v} />
          </div>
        </div>
      )}
    </div>
  );
}

function Popups({ me = null }) {
  /* The leaderboard card from this week's real board: you and whoever is
     just ahead of you, photos and all. Made-up names until it loads, or if
     you're not on it. */
  const [board, setBoard] = useState(null);
  useEffect(() => { fetchLeaderboardWeek().then(r => setBoard((r ?? []).filter(x => x.week_count > 0)), () => setBoard([])); }, []);
  const at = (board ?? []).findIndex(r => r.user_id === me?.id);
  const real = at >= 0 && board.length > 1;
  const meRow = real ? { ...board[at], src: me?.src } : { ...SAMPLE_ME, display_name: me?.name || "You", src: me?.src ?? null };
  const rivalRow = real ? (at === 0 ? board[1] : board[at - 1]) : SAMPLE_RIVAL;
  const myRank = real ? Number(board[at].rank) || at + 1 : 4;
  const around = (real ? board.slice(Math.max(0, at - 1), at + 2) : [SAMPLE_RIVAL, meRow, SAMPLE_BEHIND]).map(r => (r.user_id === meRow.user_id ? meRow : r));

  const [pick, setPick] = useState("milestone");
  /* How to look at it: on its screen (at this device's size), or the card alone. */
  const [view, setView] = useState("screen");
  const [replay, setReplay] = useState(0);
  const [variant, setVariant] = useState({ milestone: 500, home: "ios" });
  const noop = () => {};
  const ITEMS = [
    { group: "Cards" },
    { k: "milestone", label: "Milestone", short: "100, 250, 500… questions answered",
      when: "After the session that passes 100, 250, 500, 1,000, 2,500, 5,000, 7,500, 10,000, 15,000, 20,000, 25,000 or 50,000 questions answered. Each one once. Second in line after Day 1.",
      variants: MILESTONES.map(([m]) => [m, m.toLocaleString("en-GB")]),
      props: v => ({ n: v }), El: MilestoneNudge },
    { k: "improve", label: "Getting better", short: "A deck 10+ points better",
      when: "After a session, when someone’s latest 15 answers on a deck are 10+ points better than their first 15 (30+ answers, 50%+ now). Every 5 days at most; the same deck only again after another 10 points.",
      props: () => ({ deck: "Renal", before: 54, after: 78 }), El: ImproveNudge },
    { k: "streak", label: "Streak", short: "Opening the app on a streak",
      when: "On opening the app, with a streak of 3 or more that today hasn’t kept yet. Twice a week at most.",
      props: () => ({ days: 6 }), El: StreakNudge },
    { k: "leader", label: "Leaderboard", short: "After a session",
      when: "After a session, for someone on their year’s leaderboard, when the person just ahead is within 150. Twice a week at most. Uses this week’s real board here.",
      props: () => ({ me: meRow, rival: rivalRow, rank: myRank, around }), El: LeaderNudge },
    { k: "home", label: "Add to Home Screen", short: "Phone browser, not installed",
      when: "An ask. After a session, on a phone browser that hasn’t installed Resurface, from someone’s 2nd study day. Back after 5 days; gone after 3, or once it’s added. Shares one slot a week with Invite.",
      variants: [["ios", "iPhone"], ["prompt", "Android"], ["android", "Other Android"], ["inapp", "In-app browser"]],
      props: v => ({ forceKind: v }), El: HomeScreenNudge },
    { k: "invite", label: "Invite", short: "After a session",
      when: "An ask. After a session, from someone’s 4th study day. Back 10 days after ✕, gone after 3; 21 days after a share. Shares one slot a week with Home Screen.",
      props: () => ({ me }), El: InviteNudge },
    { k: "combo", label: "Combo", short: "Right answers in a row",
      when: "During a session, when a run of right answers reaches 3, 5, 10, 15, 20…: drops in at the top, holds for a moment and lifts away. Separate from the cards.",
      noShow: true, props: () => ({}), El: ComboPreview },
    { k: "dayone", label: "Day 1", short: "End of the very first session",
      when: "At the end of someone’s very first session. Once ever, and first in line.",
      props: () => ({}), El: DayOneNudge },

    { k: "passed", label: "Passed someone", short: "A session moved you up the board",
      when: "After a session that moved someone up their year’s leaderboard (their rank at the start against the end). Once a day at most.",
      props: () => ({ me: { ...meRow, week_count: Number(rivalRow.week_count) + 6 }, them: rivalRow, rank: Math.max(1, myRank - 1) }), El: PassedNudge },
    { k: "best", label: "Personal best", short: "Most questions in a day",
      when: "After a session that beats someone’s most questions in a day, when the old best was 30 or more. Once a week at most.",
      props: () => ({ today: 92, best: 64 }), El: BestNudge },
    { group: "Once, for new accounts" },
    { k: "name", label: "Name and year", short: "The first thing they see", when: "Once, the first thing a new account sees. Full screen.", full: true },
    { k: "welcome", label: "Welcome note", short: "Straight after name and year", when: "Once, straight after a new account picks its name and year. Full screen.", full: true },
  ];
  const item = ITEMS.find(x => x.k === pick);
  const v = variant[pick] ?? item.variants?.[0]?.[0];
  const props = item.props ? item.props(v) : {};

  return (
    <div className="pp">
      <nav className="pp-list" aria-label="Popups">
        {ITEMS.map((x, i) => x.group
          ? <p key={`g${i}`} className="pp-group">{x.group}</p>
          : (
            <button key={x.k} type="button" className={`pp-item${pick === x.k ? " is-on" : ""}`} onClick={() => setPick(x.k)}>
              <span className="pp-item__name">{x.label}</span>
              <span className="pp-item__short">{x.short}</span>
            </button>
          ))}
      </nav>

      <section className="pp-detail">
        <div className="pp-head">
          <h3 className="pp-title">{item.label}</h3>
          {!item.noShow && <button type="button" className="pp-show btn-press" onClick={() => showPreview({ kind: pick, props })}>Show over the app</button>}
        </div>
        <p className="pp-when">{item.when}</p>
        {item.variants && (
          <div className="ax-range pp-variants" role="group" aria-label="Version">
            {item.variants.map(([k, l]) => (
              <button key={k} type="button" className={v === k ? "is-on" : ""} onClick={() => setVariant(x => ({ ...x, [pick]: k }))}>{l}</button>
            ))}
          </div>
        )}
        {!item.full && (
          <div className="pp-views">
            <div className="ax-range" role="group" aria-label="View">
              {[["screen", "On its screen"], ["card", "Card only"]].map(([k, l]) => (
                <button key={k} type="button" className={view === k ? "is-on" : ""} onClick={() => setView(k)}>{l}</button>
              ))}
            </div>
            {view !== "card" && <button type="button" className="pp-replay" onClick={() => setReplay(n => n + 1)}>Replay</button>}
          </div>
        )}
        {item.full ? (
          <div className="pp-stage"><p className="pp-stage__note">This one fills the screen. Press <strong>Show over the app</strong> to see it.</p></div>
        ) : view === "card" ? (
          <div className="pp-stage">
            <item.El key={`${pick}-${v}-${real}`} {...props} inline onAction={noop} onClose={noop} onDone={noop} />
          </div>
        ) : (
          <ScreenFrame key={`${pick}-${v}-${replay}`} kind={pick} v={v} />
        )}
        <p className="pp-foot">One card per visit at most, bottom right (compact at the bottom on a phone): after a finished session (not one left halfway), or on opening the app for the streak. Rewards come before the two asks.</p>
      </section>
    </div>
  );
}

const TABS = [
  { k: "overview", label: "Overview" },
  { k: "activity", label: "Activity" },
  { k: "people", label: "People" },
  { k: "flags", label: "Reported" },
  { k: "popups", label: "Popups" },
];

export default function AdminView({ me = null }) {
  const [tab, setTab] = useState("overview");
  const [flagCount, setFlagCount] = useState(null);
  const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };

  /* The Reported count on its tab, whichever tab is open. */
  useEffect(() => { fetchFlags().then(r => setFlagCount(r.length), () => {}); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Admin</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2 }}>Only you and the other admins can see this.</p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div className="ax" style={{ ...band, paddingTop: "clamp(18px, 2.6vh, 26px)", paddingBottom: "clamp(40px, 6vh, 64px)" }}>
          <nav className="ax-tabs" role="tablist" aria-label="Admin">
            {TABS.map(t => (
              <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
                className={`ax-tab${tab === t.k ? " is-on" : ""}`} onClick={() => setTab(t.k)}>
                {t.label}
                {t.k === "flags" && flagCount > 0 && <span className="ax-tab__n">{flagCount}</span>}
              </button>
            ))}
          </nav>
          <div key={tab} className="ax-body">
            {tab === "overview" && <Overview />}
            {tab === "activity" && <Activity />}
            {tab === "people" && <People />}
            {tab === "flags" && <Flags onCount={setFlagCount} />}
            {tab === "popups" && <Popups me={me} />}
          </div>
        </div>
      </div>
    </div>
  );
}
