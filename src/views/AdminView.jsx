import { useEffect, useMemo, useState } from "react";
import { h1 } from "../ui/theme";
import Wave from "../ui/Wave";
import { QUESTIONS } from "../data";
import { fetchFlags, clearFlags } from "../lib/remote";
import { confirm } from "../ui/Confirm";

/**
 * What students have said is wrong.
 *
 * A flag is the only thing in the app that travels from a student back to
 * the bank, and until now it travelled into a table nobody read. One row
 * per flagged question rather than per flag: what matters is which question
 * is in trouble, how many people said so, and what they wrote.
 *
 * The fix itself happens outside the app — bank questions live in the deck
 * files — so this page's job ends at telling you which question and why.
 * Clearing is how you mark one dealt with.
 *
 * Nothing here is a permission: `admin_flags()` checks the admins table
 * itself, so a student who reached this page would see an empty list.
 */

/* The same keys FlagQuestion writes, read back as the same words the
   student picked. Anything unrecognised falls through as its own key. */
const REASONS = {
  "wrong-answer": "Wrong answer",
  "bad-explanation": "Explanation is off",
  "unclear": "Unclear wording",
  "duplicate": "Seen this already",
  "other": "Something else",
};

function Flag({ row, index, onCleared }) {
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
        <span className="flagq__reasons">
          {(row.reasons ?? []).map(r => REASONS[r] ?? r).join(" · ")}
        </span>
        <button type="button" className="gen-link flagq__clear" onClick={clear} disabled={busy}>
          {busy ? "Clearing…" : "Clear"}
        </button>
      </div>

      <p className="flagq__stem">
        {q ? q.q : <span className="flagq__missing">Question #{row.question_id} — not in the bank on this device</span>}
      </p>
      {where && <p className="flagq__where">{where}</p>}

      {notes.length > 0 && (
        <ul className="flagq__notes">
          {notes.map((n, i) => <li key={i}>“{n}”</li>)}
        </ul>
      )}
    </li>
  );
}

export default function AdminView() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchFlags()
      .then(d => { if (!cancelled) setRows(d); })
      .catch(err => { if (!cancelled) setError(err.message || "Couldn’t load the flags."); });
    return () => { cancelled = true; };
  }, []);

  const band = { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 3vw, 40px)", width: "100%" };
  const total = rows?.reduce((n, r) => n + Number(r.flags), 0) ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "var(--app-vh)" }}>
      <div className="page-band" style={{ ...band, paddingTop: "clamp(22px, 3.6vh, 36px)", paddingBottom: "clamp(18px, 2.8vh, 28px)" }}>
        <h1 data-in="left" style={{ ...h1, margin: 0, "--i": 0 }}>Review</h1>
        {/* Rendered whatever the state, so the band keeps its height and the
            wave under it does not move when the flags land. */}
        <p className="lb-you">
          {rows === null
            ? " "
            : rows.length === 0
              ? "Nothing flagged. This fills up when someone reports a question."
              : `${rows.length} question${rows.length === 1 ? "" : "s"} · ${total} report${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <Wave from="transparent" to="var(--c-card-solid)" />

      <div style={{ background: "var(--c-card-solid)", flex: 1 }}>
        <div style={{ ...band, maxWidth: 820, paddingTop: "clamp(20px, 3vh, 28px)", paddingBottom: "clamp(36px, 5vh, 56px)" }}>
          {error && <p className="flagq__error">{error}</p>}
          {rows !== null && rows.length > 0 && (
            <ul className="flagq-list">
              {rows.map((r, i) => (
                <Flag
                  key={r.question_id}
                  row={r}
                  index={i}
                  onCleared={id => setRows(list => list.filter(x => x.question_id !== id))}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
