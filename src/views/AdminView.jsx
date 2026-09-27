import { useCallback, useEffect, useMemo, useState } from "react";
import { h1 } from "../ui/theme";
import Wave from "../ui/Wave";
import { QUESTIONS } from "../data";
import {
  fetchOverview, fetchPeople, fetchGenerationDaily, fetchMarketingList,
  setAdmin, fetchFlags, clearFlags,
} from "../lib/remote";
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
   Where each number stands and where it stood a week ago. The change is
   the column worth reading; the rest is the context for it. */
function Overview() {
  const [{ rows, error }] = useSection(fetchOverview);
  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  return (
    <table className="adm-table adm-table--tight">
      <thead>
        <tr><th>&nbsp;</th><th className="adm-num">now</th><th className="adm-num">7d ago</th><th className="adm-num">change</th></tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const delta = Number(r.now_value) - Number(r.prior_value);
          return (
            <tr key={r.metric}>
              <th scope="row">{r.metric}</th>
              <td className="adm-num">{r.now_value}</td>
              <td className="adm-num adm-dim">{r.prior_value}</td>
              <td className={`adm-num${delta > 0 ? " adm-up" : delta < 0 ? " adm-down" : " adm-dim"}`}>
                {delta > 0 ? `+${delta}` : delta < 0 ? delta : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── People ───────────────────────────────────────────────────────── */
function People() {
  const [{ rows, error }, setState] = useSection(fetchPeople);
  const [busy, setBusy] = useState(null);

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

  return (
    <table className="adm-table adm-people">
      <thead>
        <tr>
          <th>Who</th>
          <th>Joined</th>
          <th>Last seen</th>
          <th className="adm-num">Answers</th>
          <th className="adm-num">Gen</th>
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(p => (
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
            <td>
              <button type="button" className="gen-link" disabled={busy === p.user_id} onClick={() => toggle(p)}>
                {busy === p.user_id ? "…" : p.is_admin ? "Remove" : "Make admin"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Generating ────────────────────────────────────────────────────
   Questions per day, not requests. The free tier caps requests and one
   request returns several questions, so read this as the shape of usage
   rather than a number to set against the quota. */
function Generating() {
  const load = useCallback(() => fetchGenerationDaily(14), []);
  const [{ rows, error }] = useSection(load);
  const peak = useMemo(() => Math.max(1, ...(rows ?? []).map(r => Number(r.questions))), [rows]);

  if (error) return <Empty>{error}</Empty>;
  if (!rows) return <Empty>&nbsp;</Empty>;
  if (rows.length === 0) return <Empty>Nothing generated in the last fortnight.</Empty>;

  return (
    <>
      <ul className="adm-days">
        {rows.map(r => (
          <li key={r.day}>
            <span className="adm-day">{dmy(r.day)}</span>
            <span className="adm-bar"><span style={{ width: `${(Number(r.questions) / peak) * 100}%` }} /></span>
            <span className="adm-num">{r.questions}</span>
            <span className="adm-dim adm-by">{r.people} {Number(r.people) === 1 ? "person" : "people"}</span>
          </li>
        ))}
      </ul>
      <p className="adm-note">
        Questions, not requests. The free tier limits requests and each one returns
        several questions, so this shows the shape of usage rather than how close the
        quota is — counting requests would have to happen in the backend.
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
