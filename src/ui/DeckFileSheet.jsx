import { useEffect } from "react";
import { C, card, primaryBtn, btnGhost } from "./theme";

/**
 * What an uploaded deck file will change, before anything is written.
 * The sentences are the whole of it: how many questions move, which rows
 * were unusable, and whether the file looks cut short.
 */
function sentences(plan) {
  const n = plan.updates.length;
  const out = [];
  out.push(n
    ? `${n} question${n === 1 ? "" : "s"} will be updated.`
    : "Nothing in this file changes a question.");
  if (plan.unchanged) {
    out.push(`${plan.unchanged} ${plan.unchanged === 1 ? "is" : "are"} already the same.`);
  }
  if (plan.missing) {
    const one = plan.missing === 1;
    out.push(`${plan.missing} question${one ? "" : "s"} in this deck ${one ? "was" : "were"} not in the file, so ${one ? "it stays" : "they stay"} as ${one ? "it is" : "they are"}.`);
  }
  if (plan.truncated) {
    out.push(`The file said it had ${plan.declared} questions and ${plan.received} came back. If it was cut short, the rest was not checked.`);
  }
  if (plan.repeated) out.push("A repeated question was read from its last copy.");
  if (plan.broken?.length) {
    out.push(`${plan.broken.length} line${plan.broken.length === 1 ? "" : "s"} could not be read.`);
  }
  return out;
}

export default function DeckFileSheet({ deckName, plan, error, busy, done, failed = 0, onApply, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const skips = plan?.skipped ?? [];
  const shown = skips.slice(0, 8);
  const canApply = Boolean(plan && plan.updates.length && !done);
  const updated = done ? Math.max(0, (plan?.updates.length ?? 0) - failed) : 0;

  return (
    <div
      role="dialog" aria-modal="true" aria-label={deckName ? `Upload corrections to ${deckName}` : "Upload corrections"}
      style={{
        position: "fixed", inset: 0, background: "rgba(26, 47, 122, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        backdropFilter: "blur(4px)", padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="anim-scale-in" style={{ ...card, maxWidth: 440, width: "100%", padding: "32px 28px", textAlign: "left" }}>
        <div style={{ fontSize: 18, color: C.text, fontWeight: 600, letterSpacing: -0.3 }}>
          {done ? "Corrections saved" : "Upload corrections"}
        </div>
        <div style={{ fontSize: 14, color: C.sub, marginTop: 8, lineHeight: 1.55 }}>
          {error && <p style={{ margin: "10px 0 0" }}>{error}</p>}
          {done && (
            <p style={{ margin: "10px 0 0" }}>
              {updated} question{updated === 1 ? "" : "s"} updated.
              {failed > 0 ? ` ${failed} didn't save.` : ""}
            </p>
          )}
          {!done && plan && sentences(plan).map(s => (
            <p key={s} style={{ margin: "10px 0 0" }}>{s}</p>
          ))}
          {!done && shown.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: 0 }}>{skips.length} row{skips.length === 1 ? "" : "s"} left out.</p>
              {shown.map((s, i) => (
                <p key={`${s.id ?? "x"}-${i}`} style={{ margin: "6px 0 0", color: C.muted }}>
                  {s.id ? `${s.id}: ` : ""}{s.skip}{s.q ? `. ${s.q}` : ""}
                </p>
              ))}
              {skips.length > shown.length && (
                <p style={{ margin: "6px 0 0", color: C.muted }}>and {skips.length - shown.length} more.</p>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
          {canApply && (
            <button type="button" className="btn-press" onClick={onApply} disabled={busy} style={{ ...primaryBtn, flex: 1, padding: "12px 18px", fontSize: 14.5, opacity: busy ? 0.7 : 1 }}>
              {busy ? "Updating…" : `Update ${plan.updates.length} question${plan.updates.length === 1 ? "" : "s"}`}
            </button>
          )}
          <button type="button" className="btn-press" onClick={onClose} disabled={busy} style={{ ...btnGhost, flex: 1, padding: "12px 18px", fontSize: 14.5, opacity: busy ? 0.5 : 1 }}>
            {done || !canApply ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
