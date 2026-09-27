import { useCallback, useEffect, useMemo, useState } from "react";
import { h1 } from "../ui/theme";
import Wave from "../ui/Wave";
import { QUESTIONS } from "../data";
import {
  fetchOverview, fetchOverviewDaily, fetchPeople, fetchPeopleDaily, fetchGenerationDaily,
  fetchMarketingList, fetchTokenTotals, fetchTokensDaily, setAdmin, fetchFlags, clearFlags,
} from "../lib/remote";
import { Spark, ChartPanel } from "../ui/Chart";
import { confirm } from "../ui/Confirm";

/**
 * Running the place.
 *
 * Five sections behind one tab, and every one of them reads a SECURITY
 * DEFINER function that checks the `admins` table itself. Nothing here is a
 * permission: a student who reached this page would find five empty lists.
 * That matters most on People, which carries everybody's email.
 *
 * The fixes these sections point at mostly happen elsewhere — bank questions
 * live in the deck files, mail goes out of your own client — so the job of
 * this page ends at telling you what is true.
 */

const SECTIONS = [
  { k: "overview", label: "Overview" },
  { k: "people", label: "People" },
  { k: "generating", label: "Generating" },
  { k: "tokens", label: "Tokens" },
  { k: "mail", label: "Mail" },
  { k: "flags", label: "Flags" },
];

/* The same keys FlagQuestion writes, read back as the words the student
   picked. Anything unrecognised falls through as its own key. */
const REASONS = {
  "wrong-answer": "Wrong answer",
  "bad-explanation": "Explanation is off",
  "unclear": "Unclear wording",
  "duplicate": "Seen this already",
  "other": "Something else",
};

const dmy = iso => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

/** Loads the first time its section is opened, and remembers after that. */
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
  return <p className="adm-empty">{children}</p>;
}

/* ── Overview ──────────────────────────────────────────────────────
   A row per metric across the full width: what happened today, this week,
   the week before, and in total, with thirty days of shape beside it. The
   week-on-week change is the number that tells you something; the rest is
   what you need to know whether to believe it.

   Accounts, Generated, Flags and Decks count things that came into being
   in the window. Active counts distinct people, which cannot be summed, so
   it is distinct-in-window — a person studying every day is one, not seven.
   Answers is the sum of what everybody did. */
const METRICS = {
  accounts:  { label: "Accounts", unit: "new" },
  active:    { label: "Active", unit: "people" },
  answers:   { label: "Answers", unit: "answered" },
  generated: { label: "Generated", unit: "questions" },
  flags:     { label: "Flags", unit: "reports" },
  decks:     { label: "Decks", unit: "made" },
};

function Overview() {
  const [totals] = useSection(fetchOverview);
  const loadDaily = useCallback(() => fetchOverviewDaily(30), []);
  const [daily] = useSection(loadDaily);

  const series = useMemo(() => {
    const by = new Map();
    for (const r of daily.rows ?? []) {
      if (!by.has(r.key)) by.set(r.key, []);
      by.get(r.key).push(Number(r.value));
    }
    return by;
  }, [daily.rows]);

  /* The days themselves, so an opened chart can say when rather than only
     how much. Taken from one metric — every metric runs the same range. */
  const dayList = useMemo(
    () => (daily.rows ?? []).filter(r => r.key === "accounts").map(r => r.day),
    [daily.rows],
  );

  if (totals.error) return <Empty>{totals.error}</Empty>;
  if (!totals.rows) return <Empty>&nbsp;</Empty>;

  return (
    <table className="adm-table adm-overview">
      <thead>
        <tr>
          <th>&nbsp;</th>
          <th className="adm-num">today</th>
          <th className="adm-num">this week</th>
          <th className="adm-num">week before</th>
          <th className="adm-num">change</th>
          <th className="adm-num">all time</th>
          <th className="adm-trend-head">last 30 days</th>
        </tr>
      </thead>
      <tbody>
        {totals.rows.map(r => {
          const m = METRICS[r.key] ?? { label: r.key, unit: "" };
          const delta = Number(r.last7) - Number(r.prev7);
          return (
            <tr key={r.key}>
              <th scope="row">
                <span className="adm-metric">{m.label}</span>
                <span className="adm-unit">{m.unit}</span>
              </th>
              <td className="adm-num">{r.today}</td>
              <td className="adm-num">{r.last7}</td>
              <td className="adm-num adm-dim">{r.prev7}</td>
              <td className={`adm-num${delta > 0 ? " adm-up" : delta < 0 ? " adm-down" : " adm-dim"}`}>
                {delta > 0 ? `+${delta}` : delta < 0 ? delta : "—"}
              </td>
              <td className="adm-num adm-dim">{r.total}</td>
              <td className="adm-trend">
                <Spark points={series.get(r.key)} label={m.label} days={dayList} unit={m.unit} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── People ────────────────────────────────────────────────────────
   The roster, with the same shape beside each name that the overview
   carries: thirty days of whether they actually study. A join date and a
   total say who signed up; the line says who stayed. */
function People() {
  const [{ rows, error }, setState] = useSection(fetchPeople);
  const loadDaily = useCallback(() => fetchPeopleDaily(30), []);
  const [daily] = useSection(loadDaily);
  const [busy, setBusy] = useState(null);
  const [sort, setSort] = useState("recent");

  /* The series arrives sparse — only days somebody did something — so the
     quiet days are filled in here. Thirty zeros beat thirty rows on the
     wire, and a line drawn from gaps would lie about its shape. */
  const { byUser, days } = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const index = new Map(days.map((d, i) => [d, i]));
    const byUser = new Map();
    for (const r of daily.rows ?? []) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, Array(days.length).fill(0));
      const i = index.get(r.day);
      if (i != null) byUser.get(r.user_id)[i] = Number(r.answers);
    }
    return { byUser, days };
  }, [daily.rows]);

  const sorted = useMemo(() => {
    const list = [...(rows ?? [])];
    if (sort === "answers") list.sort((a, b) => Number(b.answered) - Number(a.answered));
    if (sort === "recent") list.sort((a, b) => String(b.last_active ?? "").localeCompare(String(a.last_active ?? "")));
    if (sort === "joined") list.sort((a, b) => String(b.joined).localeCompare(String(a.joined)));
    return list;
  }, [rows, sort]);

  async function toggle(person) {
    const making = !person.is_admin;
    if (!making && !await confirm({
      title: `Remove ${person.display_name || person.email} as an admin?`,
      body: "They lose the Admin tab and everything behind it.",
      action: "Remove",
      danger: true,
    })) return;
    setBusy(person.user_id);
    try {
      await setAdmin(person.user_id, making);
      setState(s => ({ ...s, rows: s.rows.map(r => (r.user_id === person.user_id ? { ...r, is_admin: making } : r)) }));
    } catch (err) {
      setState(s => ({ ...s, error: err.message }));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;

  const studied = rows.filter(p => Number(p.answered) > 0).length;
  const thisWeek = rows.filter(p => p.last_active && p.last_active > new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).length;

  return (
    <>
      <div className="adm-strip">
        <span><strong>{rows.length}</strong> accounts</span>
        <span><strong>{studied}</strong> have ever studied</span>
        <span><strong>{thisWeek}</strong> studied this week</span>
        <span><strong>{rows.filter(p => p.is_admin).length}</strong> admins</span>
        <span className="adm-strip__sort">
          sorted by{" "}
          {[["recent", "last seen"], ["answers", "answers"], ["joined", "joined"]].map(([k, l]) => (
            <button key={k} type="button"
              className={`adm-sort${sort === k ? " is-on" : ""}`}
              onClick={() => setSort(k)}>{l}</button>
          ))}
        </span>
      </div>

      <table className="adm-table adm-people">
        <thead>
          <tr>
            <th>Who</th>
            <th>Joined</th>
            <th>Last seen</th>
            <th className="adm-num">Answers</th>
            <th className="adm-num">Gen</th>
            <th className="adm-trend-head">last 30 days</th>
            <th>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.user_id}>
              <th scope="row">
                <span className="adm-name">
                  {p.display_name || "—"}
                  {p.is_admin && <span className="adm-badge">admin</span>}
                </span>
                <span className="adm-email">{p.email}</span>
              </th>
              <td className="adm-dim">{dmy(p.joined)}</td>
              <td className={p.last_active ? "" : "adm-dim"}>{p.last_active ? dmy(p.last_active) : "never"}</td>
              <td className="adm-num">{p.answered}</td>
              <td className="adm-num">{p.generated}</td>
              <td className="adm-trend">
                <Spark
                  points={byUser.get(p.user_id)}
                  days={days}
                  label={p.display_name || p.email}
                  unit="answers"
                />
              </td>
              <td>
                <button type="button" className="gen-link" disabled={busy === p.user_id} onClick={() => toggle(p)}>
                  {busy === p.user_id ? "…" : p.is_admin ? "Remove" : "Make admin"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ── Generating ────────────────────────────────────────────────────
   Questions per day, not requests. The free tier caps requests and one
   request returns several questions, so read this as the shape of usage
   rather than a number to set against the quota. */
function Generating() {
  const load = useCallback(() => fetchGenerationDaily(30), []);
  const [{ rows, error }] = useSection(load);

  const { points, days, people } = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const index = new Map(days.map((d, i) => [d, i]));
    const points = Array(days.length).fill(0);
    let people = 0;
    for (const r of rows ?? []) {
      const i = index.get(r.day);
      if (i != null) points[i] = Number(r.questions);
      people = Math.max(people, Number(r.people));
    }
    return { points, days, people };
  }, [rows]);

  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  if (rows.length === 0) return <Empty>Nothing generated in the last month.</Empty>;

  const total = points.reduce((a, b) => a + b, 0);
  const busiest = Math.max(...points);

  return (
    <>
      <div className="adm-strip">
        <span><strong>{total}</strong> questions in 30 days</span>
        <span><strong>{points[points.length - 1]}</strong> today</span>
        <span><strong>{busiest}</strong> on the busiest day</span>
        <span><strong>{people}</strong> at most in one day</span>
      </div>
      <InlineChart points={points} days={days} label="Questions generated" unit="questions" />
      <p className="adm-note">
        Questions, not requests. The free tier limits requests and each one returns
        several questions, so this shows the shape of usage rather than how close the
        quota is — counting requests would have to happen in the backend.
      </p>
    </>
  );
}

/* A section whose whole point is the chart gets it open already: bars in
   the page rather than a line to click through to. The panel is still
   there behind Expand, for reading a day off it. */
function InlineChart({ points, days, label, unit, tone = "accent" }) {
  const [open, setOpen] = useState(false);
  const peak = Math.max(1, ...points);
  return (
    <div className="chart-inline">
      <div className="chart-inline__head">
        <span className="chart-inline__label">{label}</span>
        <button type="button" className="gen-link" onClick={() => setOpen(true)}>Expand</button>
      </div>
      <div className="chart-inline__bars">
        {points.map((v, i) => (
          <span key={days[i]} className={`chart-col is-${tone}`} title={`${days[i]}: ${v} ${unit}`}>
            <span style={{ height: `${Math.max(2, (v / peak) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="chart-inline__foot">
        <span>{days[0] ? dmy(days[0]) : ""}</span>
        <span>{days[days.length - 1] ? dmy(days[days.length - 1]) : ""}</span>
      </div>
      {open && (
        <ChartPanel points={points} days={days} label={label} unit={unit} tone={tone} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/* ── Tokens ────────────────────────────────────────────────────────
   What the model actually costs, which the question counts never said.
   Split by what asked for it: generating a lecture's worth of questions
   and a one-line tutor reply are not the same animal, and input tokens are
   most of the bill for the first because the lecture goes up every time. */
const KINDS = { generate: "Generating", explain: "Resurface AI" };
const thousands = n => Number(n).toLocaleString("en-GB");

function Tokens() {
  const [totals] = useSection(fetchTokenTotals);
  const loadDaily = useCallback(() => fetchTokensDaily(30), []);
  const [daily] = useSection(loadDaily);

  const { days, gen, ai } = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
    const index = new Map(days.map((d, i) => [d, i]));
    const gen = Array(days.length).fill(0);
    const ai = Array(days.length).fill(0);
    for (const r of daily.rows ?? []) {
      const i = index.get(r.day);
      if (i == null) continue;
      (r.kind === "generate" ? gen : ai)[i] = Number(r.total_tokens);
    }
    return { days, gen, ai };
  }, [daily.rows]);

  if (totals.error) return <Empty>{totals.error}</Empty>;
  if (!totals.rows) return <Empty>&nbsp;</Empty>;
  if (totals.rows.length === 0) {
    return <Empty>Nothing recorded yet. This fills up as people generate questions and ask the tutor.</Empty>;
  }

  const sum = k => totals.rows.reduce((a, r) => a + Number(r[k]), 0);

  return (
    <>
      <div className="adm-strip">
        <span><strong>{thousands(sum("tokens_today"))}</strong> today</span>
        <span><strong>{thousands(sum("tokens_7d"))}</strong> this week</span>
        <span><strong>{thousands(sum("tokens_all"))}</strong> all time</span>
        <span><strong>{thousands(sum("calls_all"))}</strong> calls</span>
      </div>

      <table className="adm-table adm-table--tight">
        <thead>
          <tr>
            <th>&nbsp;</th>
            <th className="adm-num">today</th>
            <th className="adm-num">7 days</th>
            <th className="adm-num">all time</th>
            <th className="adm-num">calls</th>
            <th className="adm-trend-head">last 30 days</th>
          </tr>
        </thead>
        <tbody>
          {totals.rows.map(r => (
            <tr key={r.kind}>
              <th scope="row">{KINDS[r.kind] ?? r.kind}</th>
              <td className="adm-num">{thousands(r.tokens_today)}</td>
              <td className="adm-num">{thousands(r.tokens_7d)}</td>
              <td className="adm-num adm-dim">{thousands(r.tokens_all)}</td>
              <td className="adm-num adm-dim">{thousands(r.calls_all)}</td>
              <td className="adm-trend">
                <Spark
                  points={r.kind === "generate" ? gen : ai}
                  days={days}
                  label={`${KINDS[r.kind] ?? r.kind} tokens`}
                  unit="tokens"
                  tone={r.kind === "generate" ? "accent" : "success"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="adm-note">
        Tokens as the provider reports them, recorded per call by the backend. Counts
        only calls that reached the model: a request refused by the rate limiter never
        gets here, and neither does one that failed.
      </p>
    </>
  );
}

/* ── Mail ─────────────────────────────────────────────────────────── */
function Mail() {
  const [{ rows, error }] = useSection(fetchMarketingList);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const list = rows.map(r => r.email).join(", ");
    try {
      await navigator.clipboard.writeText(list);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { window.prompt("Copy these", list); }
  }

  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  if (rows.length === 0) return <Empty>Nobody has opted in yet.</Empty>;

  return (
    <>
      <div className="adm-mail-head">
        <span>{rows.length} {rows.length === 1 ? "person has" : "people have"} opted in.</span>
        <button type="button" className="gen-link" onClick={copy}>{copied ? "Copied" : "Copy all"}</button>
      </div>
      <table className="adm-table">
        <tbody>
          {rows.map(r => (
            <tr key={r.email}>
              <th scope="row">{r.display_name || "—"}</th>
              <td className="adm-email-cell">{r.email}</td>
              <td className="adm-dim">{dmy(r.joined)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ── Flags ────────────────────────────────────────────────────────── */
function FlagRow({ row, index, onCleared }) {
  const [busy, setBusy] = useState(false);
  const q = useMemo(() => QUESTIONS.find(x => x.id === row.question_id), [row.question_id]);
  const notes = (row.notes ?? []).filter(n => String(n || "").trim());
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

  return (
    <li className="flagq" data-in="rise" style={{ "--i": index }}>
      <div className="flagq__head">
        <span className="flagq__count">{row.flags}×</span>
        <span className="flagq__reasons">{(row.reasons ?? []).map(r => REASONS[r] ?? r).join(" · ")}</span>
        <button type="button" className="gen-link flagq__clear" onClick={clear} disabled={busy}>
          {busy ? "Clearing…" : "Clear"}
        </button>
      </div>
      <p className="flagq__stem">
        {q ? q.q : <span className="flagq__missing">Question #{row.question_id} — not in the bank on this device</span>}
      </p>
      {where && <p className="flagq__where">{where}</p>}
      {notes.length > 0 && (
        <ul className="flagq__notes">{notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>
      )}
    </li>
  );
}

function Flags() {
  const [{ rows, error }, setState] = useSection(fetchFlags);
  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  if (rows.length === 0) return <Empty>Nothing flagged. This fills up when someone reports a question.</Empty>;
  return (
    <ul className="flagq-list">
      {rows.map((r, i) => (
        <FlagRow
          key={r.question_id}
          row={r}
          index={i}
          onCleared={id => setState(s => ({ ...s, rows: s.rows.filter(x => x.question_id !== id) }))}
        />
      ))}
    </ul>
  );
}

const PANELS = {
  overview: Overview,
  people: People,
  generating: Generating,
  tokens: Tokens,
  mail: Mail,
  flags: Flags,
};

export default function AdminView() {
  const [section, setSection] = useState("overview");
  const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };
  const Panel = PANELS[section];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Admin</h1>
        <p className="lb-you">Only you and the other admins can see this.</p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          <div className="tg-tabs" role="tablist" aria-label="Admin sections">
            {SECTIONS.map(s => (
              <button key={s.k} type="button" role="tab" aria-selected={section === s.k}
                className={`tg-tab${section === s.k ? " is-active" : ""}`}
                onClick={() => setSection(s.k)}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Keyed so a section fetches when you open it and not before. */}
          <div className="adm-body" key={section}>
            <Panel />
          </div>
        </div>
      </div>
    </div>
  );
}
