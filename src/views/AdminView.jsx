import { useCallback, useEffect, useMemo, useState } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import { QUESTIONS } from "../data";
import {
  fetchOverview, fetchOverviewDaily, fetchStorage, fetchPeople, fetchPeopleDaily, fetchGeneratedDaily,
  setAdmin, fetchFlags, clearFlags, fetchAiQuota, adminDeleteFeatured,
} from "../lib/remote";
import EditQuestionModal from "../ui/EditQuestionModal";
import { persistFor } from "../lib/adminFeatured";
import { TrendChart, Spark } from "../ui/Chart";
import { confirm } from "../ui/Confirm";
import { StreakNudge, LeaderNudge, InviteNudge } from "../ui/Nudges";
import NamePrompt from "../ui/NamePrompt";
import WelcomeReveal from "../ui/WelcomeReveal";

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
          {q?.featured && <button type="button" className="gen-link" onClick={() => setEditing(true)} disabled={busy}>Edit question</button>}
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
const SAMPLE_ME = { user_id: "me", display_name: "You", week_count: 212 };
const SAMPLE_RIVAL = { user_id: "rival", display_name: "Omar Arif", week_count: 249 };

function Popups({ welcomeNote, welcomeStart, me = null }) {
  const meRow = { ...SAMPLE_ME, display_name: me?.name || "You", src: me?.src ?? null };
  const [open, setOpen] = useState(null);
  const close = () => setOpen(null);
  const nudges = [
    { k: "streak", label: "Streak", when: "On opening the app, with a streak of 2 or more that today hasn’t kept yet. Once a day.",
      el: p => <StreakNudge days={6} onAction={close} onClose={close} {...p} /> },
    { k: "leader", label: "Leaderboard", when: "After a session, for someone on their year’s leaderboard. Once a day, and not on a day the invite shows.",
      el: p => <LeaderNudge me={meRow} rival={SAMPLE_RIVAL} rank={4} year={2} onAction={close} onClose={close} {...p} /> },
    { k: "invite", label: "Invite", when: "After a session, from someone’s 2nd study day. Back 5 days after a ✕, gone after 3; 21 days after a share.",
      el: p => <InviteNudge me={me} onAction={close} onClose={close} {...p} /> },
  ];
  const big = [
    { k: "welcome", label: "Welcome note", when: "Once, straight after a new account picks its name and year." },
    { k: "name", label: "Name and year", when: "Once, the first thing a new account sees." },
  ];
  return (
    <>
      <p className="ax-note">What each popup looks like, and when it shows. At most one nudge a visit, never during a session or over the update bar.</p>
      <div className="ax-pops">
        {nudges.map(n => (
          <section key={n.k} className="ax-pop">
            <div className="ax-pop__head">
              <h3 className="ax-h3">{n.label}</h3>
              <button type="button" className="ax-link" onClick={() => setOpen(n.k)}>Show</button>
            </div>
            <p className="ax-note">{n.when}</p>
            {n.el({ inline: true })}
          </section>
        ))}
      </div>
      <div className="ax-pops is-big">
        {big.map(b => (
          <section key={b.k} className="ax-pop">
            <div className="ax-pop__head">
              <h3 className="ax-h3">{b.label}</h3>
              <button type="button" className="ax-link" onClick={() => setOpen(b.k)}>Show</button>
            </div>
            <p className="ax-note">{b.when}</p>
          </section>
        ))}
      </div>
      {nudges.find(n => n.k === open)?.el({})}
      {open === "name" && <NamePrompt suggestion="Preview" onSave={close} />}
      {open === "welcome" && welcomeNote && <WelcomeReveal welcome={welcomeNote} actions={welcomeStart ? [welcomeStart] : []} onAction={close} onClose={close} />}
    </>
  );
}

const TABS = [
  { k: "overview", label: "Overview" },
  { k: "activity", label: "Activity" },
  { k: "people", label: "People" },
  { k: "flags", label: "Reported" },
  { k: "popups", label: "Popups" },
];

export default function AdminView({ welcomeNote = null, welcomeStart = null, me = null }) {
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
            {tab === "popups" && <Popups welcomeNote={welcomeNote} welcomeStart={welcomeStart} me={me} />}
          </div>
        </div>
      </div>
    </div>
  );
}
