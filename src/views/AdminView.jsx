import { useCallback, useEffect, useMemo, useState } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import { QUESTIONS } from "../data";
import {
  fetchOverview, fetchOverviewDaily, fetchStorage, fetchPeople, fetchPeopleDaily,
  setAdmin, fetchFlags, clearFlags, fetchAiQuota, adminDeleteFeatured,
} from "../lib/remote";
import EditQuestionModal from "../ui/EditQuestionModal";
import { persistFor } from "../lib/adminFeatured";
import { TrendChart, Spark } from "../ui/Chart";
import { confirm } from "../ui/Confirm";

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
 * Sharing, Resurface decks, Generating, AI usage, Activity and Mailing list
 * were folded in or dropped. Everything reads SECURITY DEFINER functions
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

function Overview({ goPeople }) {
  const [totals] = useSection(fetchOverview);
  const [range, setRange] = useState(30);
  const loadDaily = useCallback(() => fetchOverviewDaily(range), [range]);
  const [daily] = useSection(loadDaily);
  const [people] = useSection(fetchPeople);
  const loadPD = useCallback(() => fetchPeopleDaily(92), []);
  const [pdaily] = useSection(loadPD);
  const [metric, setMetric] = useState("answers");
  const [picked, setPicked] = useState(null);

  const { days, series } = useMemo(() => {
    const series = new Map();
    const days = [];
    for (const r of daily.rows ?? []) {
      if (!series.has(r.key)) series.set(r.key, []);
      series.get(r.key).push(Number(r.value) || 0);
      if (r.key === "accounts") days.push(String(r.day).slice(0, 10));
    }
    return { days, series };
  }, [daily.rows]);
  const points = series.get(metric) ?? [];
  const at = picked == null || picked >= days.length ? days.length - 1 : picked;
  const day = days[at];

  const byId = useMemo(() => new Map((people.rows ?? []).map(p => [p.user_id, p])), [people.rows]);
  const studied = useMemo(() => (pdaily.rows ?? [])
    .filter(r => String(r.day).slice(0, 10) === day && Number(r.answers) > 0)
    .map(r => ({ p: byId.get(r.user_id), n: Number(r.answers) }))
    .filter(x => x.p)
    .sort((a, b) => b.n - a.n), [pdaily.rows, day, byId]);
  const joined = useMemo(() => (people.rows ?? []).filter(p => dayKey(p.joined) === day), [people.rows, day]);

  const students = (people.rows ?? []).filter(p => !p.is_admin);
  const quiet = students.filter(p => statusOf(p) === "quiet").sort((a, b) => String(b.last_active).localeCompare(String(a.last_active)));
  const notStarted = students.filter(p => statusOf(p) === "new" && Date.now() - new Date(p.joined) < 30 * DAY)
    .sort((a, b) => String(b.joined).localeCompare(String(a.joined)));

  if (totals.error) return <Empty>{totals.error}</Empty>;
  if (!totals.rows) return <Empty>&nbsp;</Empty>;
  const row = k => totals.rows.find(r => r.key === k) ?? { last7: 0, prev7: 0 };
  const chosen = METRICS.find(m => m.k === metric);

  return (
    <>
      <div className="ax-metrics" role="tablist" aria-label="What the chart shows">
        {METRICS.map(m => (
          <button key={m.k} type="button" role="tab" aria-selected={metric === m.k}
            className={`ax-metric${metric === m.k ? " is-on" : ""}`} onClick={() => setMetric(m.k)}>
            <span className="ax-metric__label">{m.label}</span>
            <span className="ax-metric__value">{nf(row(m.k).last7)}</span>
            <span className="ax-metric__sub">{m.sub}</span>
            <Delta now={row(m.k).last7} before={row(m.k).prev7} />
          </button>
        ))}
      </div>

      <section className="ax-chart">
        <div className="ax-chart__head">
          <h3 className="ax-h3">{chosen.label} per day</h3>
          <div className="ax-range" role="group" aria-label="Range">
            {[30, 90].map(n => (
              <button key={n} type="button" aria-pressed={range === n}
                className={range === n ? "is-on" : ""} onClick={() => { setRange(n); setPicked(null); }}>{n} days</button>
            ))}
          </div>
        </div>
        {daily.error ? <Empty>{daily.error}</Empty> : !daily.rows ? <div className="ax-chart__ph" /> : (
          <TrendChart points={points} days={days} unit={chosen.unit} picked={at} onPick={setPicked} />
        )}
      </section>

      {day && (
        <section className="ax-day">
          <div className="ax-day__col">
            <h3 className="ax-h3">
              {at === days.length - 1 ? "Today" : new Date(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              <span className="ax-count">{studied.length} studied</span>
            </h3>
            {pdaily.rows && studied.length === 0 ? <p className="ax-quiet">Nobody answered a question.</p> : (
              <ul className="ax-rows">
                {studied.map(({ p, n }) => (
                  <li key={p.user_id}>
                    <span className="ax-who">{nameOf(p)}{p.study_year ? <span className="ax-year">Y{p.study_year}</span> : null}</span>
                    <span className="ax-num">{nf(n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ax-day__col">
            <h3 className="ax-h3">Signed up<span className="ax-count">{joined.length}</span></h3>
            {joined.length === 0 ? <p className="ax-quiet">Nobody.</p> : (
              <ul className="ax-rows">
                {joined.map(p => (
                  <li key={p.user_id}>
                    <span className="ax-who">{nameOf(p)}{p.study_year ? <span className="ax-year">Y{p.study_year}</span> : null}</span>
                    <span className="ax-meta">{Number(p.answered) ? `${nf(p.answered)} answered` : "Not started"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="ax-attention">
        <div className="ax-attention__col">
          <div className="ax-attention__head">
            <h3 className="ax-h3">Gone quiet<span className="ax-count">{quiet.length}</span></h3>
            <CopyEmails people={quiet} />
          </div>
          <p className="ax-note">Studied on two or more days, then nothing for a week.</p>
          {quiet.length === 0 ? <p className="ax-quiet">Nobody. Everyone who got going is still going.</p> : (
            <ul className="ax-rows">
              {quiet.slice(0, 8).map(p => (
                <li key={p.user_id}>
                  <span className="ax-who">{nameOf(p)}{p.study_year ? <span className="ax-year">Y{p.study_year}</span> : null}</span>
                  <span className="ax-meta">{ago(p.last_active)} · {nf(p.answered)} answered</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ax-attention__col">
          <div className="ax-attention__head">
            <h3 className="ax-h3">Not started<span className="ax-count">{notStarted.length}</span></h3>
            <CopyEmails people={notStarted} />
          </div>
          <p className="ax-note">Signed up in the last 30 days and hasn’t answered a question.</p>
          {notStarted.length === 0 ? <p className="ax-quiet">Nobody.</p> : (
            <ul className="ax-rows">
              {notStarted.slice(0, 8).map(p => (
                <li key={p.user_id}>
                  <span className="ax-who">{nameOf(p)}{p.study_year ? <span className="ax-year">Y{p.study_year}</span> : null}</span>
                  <span className="ax-meta">Joined {ago(dayKey(p.joined)).toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(quiet.length > 8 || notStarted.length > 8) && (
          <button type="button" className="ax-link ax-attention__more" onClick={goPeople}>See everyone in People</button>
        )}
      </section>

      <Limits />
    </>
  );
}

/* What would stop the app if it ran out: the two daily AI allowances
   (500 requests each, reset 8am here) and the free database's 500 MB. */
function Meter({ label, used, of, fmt = nf, sub, warnAt = 0.8 }) {
  const pct = Math.min(100, (used / of) * 100);
  const high = used >= of * warnAt;
  return (
    <div className={`ax-meter${high ? " is-high" : ""}`}>
      <span className="ax-meter__label">{label}</span>
      <span className="ax-meter__n"><strong>{fmt(used)}</strong> of {fmt(of)}</span>
      <span className="ax-meter__bar" aria-hidden="true"><span style={{ width: `${Math.max(pct, 1)}%` }} /></span>
      <span className="ax-meter__sub">{sub}</span>
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
      <h3 className="ax-h3">Limits</h3>
      <div className="ax-limits__row">
        {!quota.error && <Meter label="Generating today" used={Number(q.generate ?? 0)} of={500} sub={`Resets at ${resets}`} />}
        {!quota.error && <Meter label="Resurface AI today" used={Number(q.explain ?? 0)} of={500} sub={`Resets at ${resets}`} />}
        {!size.error && size.rows != null && (
          <Meter label="Database" used={size.rows} of={500 * MB} fmt={mb} warnAt={0.6}
            sub={size.rows >= 300 * MB ? "Over 60%: shorten the answer history or move to Pro" : "Free plan. Warns at 300 MB"} />
        )}
      </div>
    </section>
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

const TABS = [
  { k: "overview", label: "Overview" },
  { k: "people", label: "People" },
  { k: "flags", label: "Reported" },
];

export default function AdminView() {
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
            {tab === "overview" && <Overview goPeople={() => setTab("people")} />}
            {tab === "people" && <People />}
            {tab === "flags" && <Flags onCount={setFlagCount} />}
          </div>
        </div>
      </div>
    </div>
  );
}
