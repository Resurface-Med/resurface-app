import { useCallback, useEffect, useMemo, useState } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import { QUESTIONS } from "../data";
import {
  fetchOverview, fetchOverviewDaily, fetchPeople, fetchPeopleDaily, fetchGenerationDaily,
  fetchMarketingList, fetchTokenTotals, fetchTokensDaily, setAdmin, fetchFlags, clearFlags,
  fetchAiQuota, fetchShareLog,
} from "../lib/remote";
import { Spark, ChartPanel, BigChart } from "../ui/Chart";
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

/* Each section says what it is in one plain sentence under its title
   (2026-10-18): the page was a set of bare numbers you had to already know
   the meaning of. */
const SECTIONS = [
  { k: "overview", label: "Overview", title: "Overview", desc: "How much of today’s AI allowance is used, then the last 7 days compared with the 7 before." },
  { k: "people", label: "People", title: "People", desc: "Everyone with an account, and how much they use Resurface." },
  { k: "sharing", label: "Sharing", title: "Sharing", desc: "Who sent whose deck to whom: every shared link opened, every deck added, and every copy brought up to date." },
  { k: "generating", label: "Generating", title: "Questions generated", desc: "How many questions the AI wrote each day over the last 30 days." },
  { k: "tokens", label: "AI usage", title: "AI usage", desc: "How much of the AI model each feature uses, in tokens." },
  { k: "mail", label: "Mailing list", title: "Mailing list", desc: "People who agreed to receive news and study emails." },
  { k: "flags", label: "Reported", title: "Reported questions", desc: "Questions students have flagged as wrong or unclear." },
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

/* A figure and what it is: the number large, the words under it at a size
   you can read. Used for every summary on the page. */
function Stats({ items }) {
  return (
    <dl className="adm-stats">
      {items.map(([value, label]) => (
        <div key={label} className="adm-stat">
          <dd className="adm-stat__value">{value}</dd>
          <dt className="adm-stat__label">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/* ── Overview ──────────────────────────────────────────────────────
   Cards for the figures worth a glance, one chart big enough to read
   underneath, and the newest accounts beside it.

   Accounts, Generated, Flags and Decks count things that came into being
   in the window. Active counts distinct people, which cannot be summed, so
   it is distinct-in-window — a person studying every day is one, not seven.
   Answers is the sum of what everybody did. */
const METRICS = {
  accounts:  { label: "New accounts", short: "Accounts", unit: "new" },
  active:    { label: "Active people", short: "Active", unit: "people" },
  answers:   { label: "Questions answered", short: "Answered", unit: "answered" },
  generated: { label: "Questions generated", short: "Generated", unit: "questions" },
  flags:     { label: "Reports", short: "Reports", unit: "reports" },
  decks:     { label: "Decks made", short: "Decks", unit: "made" },
};
/* The four on the cards. The rest are a click away on the chart below —
   a card each would be a wall of numbers, which is what this replaced. */
const HEADLINE = ["accounts", "active", "answers", "generated"];

function Delta({ now, before }) {
  const d = Number(now) - Number(before);
  if (d === 0) return <span className="adm-card__delta adm-dim">Same as the week before</span>;
  return (
    <span className={`adm-card__delta ${d > 0 ? "adm-up" : "adm-down"}`}>
      {d > 0 ? `${Number(d).toLocaleString("en-GB")} more` : `${Number(-d).toLocaleString("en-GB")} fewer`} than the week before
    </span>
  );
}

/* ── The headline: the daily AI allowances ────────────────────────
   Rafil's main number (2026-10-18): how much of each free-tier allowance
   is spent today. Generating and Resurface AI run on separate API keys,
   each with its own 500 requests a day, which reset at midnight Pacific
   time — 8am here — so each is counted from then, not from midnight.
   (Separate only if the keys are in separate Google projects: the limit is
   per project.) */
const DAILY_LIMIT = 500;
function Allowance({ label, used, resets }) {
  const pct = Math.min(100, (used / DAILY_LIMIT) * 100);
  const left = Math.max(0, DAILY_LIMIT - used);
  return (
    <div className="adm-allow">
      <span className="adm-allow__label">{label}</span>
      <span className="adm-allow__n">
        <strong>{used.toLocaleString("en-GB")}</strong> of {DAILY_LIMIT} used today
      </span>
      <span className="adm-meter" aria-hidden="true">
        <span style={{ width: `${pct}%` }} className={pct >= 80 ? "is-high" : ""} />
      </span>
      <span className="adm-allow__sub">{left.toLocaleString("en-GB")} left · resets at {resets}</span>
    </div>
  );
}
function AiCalls() {
  const [quota] = useSection(fetchAiQuota);
  if (quota.error) return null;
  const q = quota.rows ?? {};
  const resets = q.resets_at
    ? new Date(q.resets_at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })
    : "8:00";
  return (
    <section className="adm-allowances" aria-label="Daily AI allowance">
      <Allowance label="Generating questions" used={Number(q.generate ?? 0)} resets={resets} />
      <Allowance label="Resurface AI" used={Number(q.explain ?? 0)} resets={resets} />
    </section>
  );
}

function Overview() {
  const [totals] = useSection(fetchOverview);
  const loadDaily = useCallback(() => fetchOverviewDaily(30), []);
  const [daily] = useSection(loadDaily);
  const [people] = useSection(fetchPeople);
  const [metric, setMetric] = useState("answers");

  const series = useMemo(() => {
    const by = new Map();
    for (const r of daily.rows ?? []) {
      if (!by.has(r.key)) by.set(r.key, []);
      by.get(r.key).push(Number(r.value));
    }
    return by;
  }, [daily.rows]);

  /* The days themselves, so a chart can say when rather than only how
     much. Taken from one metric — every metric runs the same range. */
  const days = useMemo(
    () => (daily.rows ?? []).filter(r => r.key === "accounts").map(r => r.day),
    [daily.rows],
  );

  const newest = useMemo(
    () => [...(people.rows ?? [])].sort((a, b) => String(b.joined).localeCompare(String(a.joined))).slice(0, 6),
    [people.rows],
  );

  if (totals.error) return <Empty>{totals.error}</Empty>;
  if (!totals.rows) return <Empty>&nbsp;</Empty>;

  const row = k => totals.rows.find(r => r.key === k);
  const chosen = METRICS[metric];

  return (
    <>
      <AiCalls />
      <div className="adm-cards">
        {HEADLINE.map(k => {
          const r = row(k);
          if (!r) return null;
          return (
            <button
              key={k}
              type="button"
              className={`adm-card${metric === k ? " is-on" : ""}`}
              onClick={() => setMetric(k)}
              aria-pressed={metric === k}
            >
              <span className="adm-card__label">{METRICS[k].label}</span>
              <span className="adm-card__value">{Number(r.last7).toLocaleString("en-GB")}</span>
              <Delta now={r.last7} before={r.prev7} />
              <span className="adm-card__spark">
                <Spark points={series.get(k)} tone="accent" plain />
              </span>
              <span className="adm-card__total">{Number(r.total).toLocaleString("en-GB")} in total</span>
            </button>
          );
        })}
      </div>

      <div className="adm-grid">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h3 className="adm-panel__title">{chosen.label}, last 30 days</h3>
            <div className="adm-seg" role="tablist" aria-label="Metric">
              {Object.keys(METRICS).map(k => (
                <button key={k} type="button" role="tab" aria-selected={metric === k}
                  className={`adm-seg__btn${metric === k ? " is-on" : ""}`}
                  onClick={() => setMetric(k)}>
                  {METRICS[k].short}
                </button>
              ))}
            </div>
          </div>
          {series.get(metric)
            ? <BigChart points={series.get(metric)} days={days} unit={chosen.unit} />
            : <Empty>&nbsp;</Empty>}
        </section>

        <aside className="adm-panel">
          <div className="adm-panel__head">
            <h3 className="adm-panel__title">Newest accounts</h3>
          </div>
          {newest.length === 0 ? <Empty>&nbsp;</Empty> : (
            <ul className="adm-list">
              {newest.map(p => (
                <li key={p.user_id}>
                  <span className="adm-list__who">
                    <span className="adm-list__name">{p.display_name || p.email}</span>
                    <span className="adm-list__meta">
                      {Number(p.answered) > 0 ? `${p.answered} questions answered` : "Hasn’t answered any yet"}
                    </span>
                  </span>
                  <span className="adm-list__when">{dmy(p.joined)}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
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
    <section className="adm-panel">
      <Stats items={[
        [rows.length, "Accounts"],
        [studied, "Have answered a question"],
        [thisWeek, "Studied this week"],
        [rows.filter(p => p.is_admin).length, "Admins"],
      ]} />

      <div className="adm-toolbar">
        <span className="adm-toolbar__label">Sort by</span>
        <div className="adm-seg" role="group" aria-label="Sort by">
          {[["recent", "Last seen"], ["answers", "Questions answered"], ["joined", "Date joined"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={sort === k}
              className={`adm-seg__btn${sort === k ? " is-on" : ""}`}
              onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
      </div>

      <table className="adm-table adm-people">
        <thead>
          <tr>
            <th>Person</th>
            <th>Joined</th>
            <th>Last seen</th>
            <th className="adm-num">Answered</th>
            <th className="adm-num">Generated</th>
            <th className="adm-trend-head">Last 30 days</th>
            <th><span className="sr-only">Admin</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr key={p.user_id}>
              <th scope="row">
                <span className="adm-name">
                  {p.display_name || <span className="adm-dim">No name yet</span>}
                  {p.is_admin && <span className="adm-badge">admin</span>}
                </span>
                <span className="adm-email">{p.email}</span>
              </th>
              <td className="adm-dim">{dmy(p.joined)}</td>
              <td className={p.last_active ? "" : "adm-dim"}>{p.last_active ? dmy(p.last_active) : "Never"}</td>
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
                  {busy === p.user_id ? "…" : p.is_admin ? "Remove admin" : "Make admin"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ── Sharing ───────────────────────────────────────────────────────
   The audit log (migration 0020). "From" is whoever owns the deck whose
   link was used — so a deck passed on from someone's copy shows as from
   them, not from its first author. Adds made before the log existed are
   rebuilt from the decks themselves; opens and updates start 18 Oct. */
const SHARE_KINDS = {
  copied:   { label: "Added", what: n => `Added the deck${n != null ? ` · ${Number(n).toLocaleString("en-GB")} questions` : ""}` },
  opened:   { label: "Opened", what: () => "Opened the link" },
  updated:  { label: "Updated", what: n => `Got ${Number(n ?? 0).toLocaleString("en-GB")} new question${Number(n) === 1 ? "" : "s"}` },
  switched: { label: "Switched", what: n => `Moved to the live deck · ${Number(n ?? 0).toLocaleString("en-GB")} questions` },
};
const whoOf = (name, email) => name || email || "Deleted account";
const when = iso => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Sharing() {
  const load = useCallback(() => fetchShareLog(500), []);
  const [{ rows, error }] = useSection(load);
  const [kind, setKind] = useState("all");

  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  if (rows.length === 0) return <Empty>No decks have been shared yet.</Empty>;

  const adds = rows.filter(r => r.kind === "copied");
  const weekAgo = Date.now() - 7 * 864e5;
  const opensWeek = rows.filter(r => r.kind === "opened" && new Date(r.at) > weekAgo).length;
  const reached = new Set(adds.map(r => r.to_email)).size;
  const byDeck = new Map();
  for (const r of adds) byDeck.set(`${r.deck_name}|${r.from_email}`, (byDeck.get(`${r.deck_name}|${r.from_email}`) ?? 0) + 1);
  const top = [...byDeck.entries()].sort((a, b) => b[1] - a[1])[0];
  const shown = kind === "all" ? rows : rows.filter(r => r.kind === kind);

  return (
    <section className="adm-panel">
      <Stats items={[
        [adds.length, "Decks added from a link"],
        [reached, "People who added someone’s deck"],
        [opensWeek, "Links opened in the last 7 days"],
        [top ? `${top[1]}×` : "–", top ? `Most added: ${top[0].split("|")[0]}` : "Most added deck"],
      ]} />

      <div className="adm-toolbar">
        <span className="adm-toolbar__label">Show</span>
        <div className="adm-seg" role="group" aria-label="Show">
          {[["all", "Everything"], ["copied", "Added"], ["opened", "Opened"], ["updated", "Updated"], ["switched", "Switched"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k}
              className={`adm-seg__btn${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? <Empty>Nothing of that kind yet.</Empty> : (
        <table className="adm-table adm-shares">
          <thead>
            <tr><th>When</th><th>From</th><th>To</th><th>Deck</th><th>What happened</th></tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td className="adm-dim adm-when">{when(r.at)}</td>
                <td>
                  <span className="adm-name">{whoOf(r.from_name, r.from_email)}</span>
                  {r.from_name && <span className="adm-email">{r.from_email}</span>}
                </td>
                <td>
                  <span className="adm-name">{whoOf(r.to_name, r.to_email)}</span>
                  {r.to_name && <span className="adm-email">{r.to_email}</span>}
                </td>
                <td className="adm-deck">{r.deck_name || "—"}</td>
                <td>
                  <span className={`adm-kind is-${r.kind}`}>{(SHARE_KINDS[r.kind]?.what ?? (() => r.kind))(r.questions)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* Phones: the same log as two-line entries — a five-column table
          broke names mid-word at that width. */}
      {shown.length > 0 && (
        <ul className="adm-share-list">
          {shown.map((r, i) => (
            <li key={i}>
              <p className="adm-share-list__who">
                <strong>{whoOf(r.from_name, r.from_email)}</strong>
                <span aria-label="to"> → </span>
                <strong>{whoOf(r.to_name, r.to_email)}</strong>
                {r.deck_name && <span className="adm-share-list__deck"> · {r.deck_name}</span>}
              </p>
              <p className="adm-share-list__what">
                <span className={`adm-kind is-${r.kind}`}>{(SHARE_KINDS[r.kind]?.what ?? (() => r.kind))(r.questions)}</span>
                <span className="adm-dim"> · {when(r.at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="adm-note">
        “From” is whoever owns the deck whose link was used, so a deck passed on from
        someone’s copy shows as from them. Adds before 18 October were rebuilt from the
        decks themselves; opened links and updates are recorded from 18 October.
      </p>
    </section>
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
    <section className="adm-panel">
      <Stats items={[
        [total.toLocaleString("en-GB"), "Questions in 30 days"],
        [points[points.length - 1].toLocaleString("en-GB"), "Today"],
        [busiest.toLocaleString("en-GB"), "On the busiest day"],
        [people, "Most people in one day"],
      ]} />
      <InlineChart points={points} days={days} label="Questions generated per day" unit="questions" />
      <p className="adm-note">
        This counts questions, not requests to the AI. Each request writes several
        questions, so it shows how much is being made rather than how close we are to
        the daily request limit.
      </p>
    </section>
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
const KINDS = { generate: "Generating questions", explain: "Resurface AI (explanations)" };
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
    <section className="adm-panel">
      <Stats items={[
        [thousands(sum("tokens_today")), "Tokens today"],
        [thousands(sum("tokens_7d")), "Tokens in the last 7 days"],
        [thousands(sum("tokens_all")), "Tokens in total"],
        [thousands(sum("calls_all")), "Requests to the AI in total"],
      ]} />

      <table className="adm-table adm-tokens">
        <thead>
          <tr>
            <th>Feature</th>
            <th className="adm-num">Today</th>
            <th className="adm-num">Last 7 days</th>
            <th className="adm-num">In total</th>
            <th className="adm-num">Requests</th>
            <th className="adm-trend-head">Last 30 days</th>
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
        Tokens are what the AI provider counts and charges by. Only requests that reached
        the AI are counted; ones turned away by the rate limit, or that failed, are not.
      </p>
    </section>
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
    <section className="adm-panel">
      <div className="adm-toolbar">
        <span className="adm-toolbar__count"><strong>{rows.length}</strong> {rows.length === 1 ? "person has" : "people have"} agreed</span>
        <button type="button" className="adm-action btn-press" onClick={copy}>{copied ? "Copied" : "Copy all emails"}</button>
      </div>
      <table className="adm-table adm-mail">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Joined</th></tr>
        </thead>
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
    </section>
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
        <span className="flagq__count">{row.flags} {Number(row.flags) === 1 ? "report" : "reports"}</span>
        <span className="flagq__reasons">{(row.reasons ?? []).map(r => REASONS[r] ?? r).join(" · ")}</span>
        <button type="button" className="gen-link flagq__clear" onClick={clear} disabled={busy}>
          {busy ? "Clearing…" : "Mark as dealt with"}
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
  if (rows.length === 0) return <Empty>Nothing reported. Questions show up here when a student reports one.</Empty>;
  return (
    <ul className="flagq-list adm-panel">
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
  sharing: Sharing,
  generating: Generating,
  tokens: Tokens,
  mail: Mail,
  flags: Flags,
};

export default function AdminView() {
  const [section, setSection] = useState("overview");
  const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };
  const Panel = PANELS[section];
  const meta = SECTIONS.find(s => s.k === section);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Admin</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: OF.soft, fontWeight: 500, letterSpacing: -0.2 }}>Only you and the other admins can see this.</p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          <div className="adm-tabs" role="tablist" aria-label="Admin sections">
            {SECTIONS.map(s => (
              <button key={s.k} type="button" role="tab" aria-selected={section === s.k}
                className={`adm-tab${section === s.k ? " is-on" : ""}`}
                onClick={() => setSection(s.k)}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Keyed so a section fetches when you open it and not before. */}
          <div className="adm-body" key={section}>
            <header className="adm-head">
              <h2 className="adm-head__title">{meta.title}</h2>
              <p className="adm-head__desc">{meta.desc}</p>
            </header>
            <Panel />
          </div>
        </div>
      </div>
    </div>
  );
}
