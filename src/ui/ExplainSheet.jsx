import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * The deeper explanation, in a sheet rather than in the card.
 *
 * Inline was the mistake. Three paragraphs of prose appended to a card that
 * already held five options and an explanation pushed the only way forward off
 * the screen, and the card grew every time you asked for help.
 *
 * A sheet keeps the question in view beside the answer, which is the whole
 * point — this text is about the option you picked, so you need to be able to
 * look at it. It scrolls on its own, so length costs nothing, and it leaves
 * exactly as it arrived.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

export default function ExplainSheet({ q, picked, onClose }) {
  const [state, setState] = useState("loading");
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${API_BASE}/api/explain`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            question: q.q, options: q.opts, correct: q.ans,
            picked, explanation: q.exp,
          }),
        });

        const body = await res.json().catch(() => ({}));
        if (!live) return;

        if (!res.ok) throw new Error(body?.error || "Couldn't get an explanation.");
        setDetail(body);
        setState("done");
      } catch (e) {
        if (!live) return;
        setError(e.message);
        setState("error");
      }
    })();

    // The reply lands after the sheet is gone if you close it early, and
    // setting state then is a leak and a React warning.
    return () => { live = false; };
  }, [q, picked]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      // The card listens for keys too — Escape here must not also reach it.
      e.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const chose = Number.isInteger(picked) && q.opts[picked] ? q.opts[picked] : null;

  return (
    <div
      className="xs-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className="xs-sheet" role="dialog" aria-modal="true" aria-label="Deeper explanation">
        <header className="xs-head">
          <div>
            <span className="xs-eyebrow">Going deeper</span>
            <h2 className="xs-q">{q.q}</h2>
          </div>
          <button type="button" className="xs-close btn-press" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {/* The two options that matter, restated — the sheet may cover the card
            on a narrow screen, and this text is meaningless without them. */}
        <div className="xs-context">
          {chose && (
            <p className="xs-ctx-row is-bad">
              <span className="xs-ctx-label">You said</span>{chose}
            </p>
          )}
          <p className="xs-ctx-row is-ok">
            <span className="xs-ctx-label">Answer</span>{q.opts[q.ans]}
          </p>
        </div>

        <div className="xs-body">
          {state === "loading" && (
            <div className="xs-loading">
              <span className="xs-dots" aria-hidden="true"><i /><i /><i /></span>
              Working out where it went wrong…
            </div>
          )}

          {state === "error" && (
            <p className="xs-error">{error}</p>
          )}

          {state === "done" && detail && (
            <>
              {detail.whyWrong && (
                <section className="xs-sec">
                  <h3 className="xs-sec-title">Where it went wrong</h3>
                  <p>{detail.whyWrong}</p>
                </section>
              )}
              <section className="xs-sec">
                <h3 className="xs-sec-title">Why it&apos;s {q.opts[q.ans]}</h3>
                <p>{detail.whyRight}</p>
              </section>
              {detail.remember && (
                <section className="xs-keep">
                  <h3 className="xs-sec-title">Take this with you</h3>
                  <p>{detail.remember}</p>
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
