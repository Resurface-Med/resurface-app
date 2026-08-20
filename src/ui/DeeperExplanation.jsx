import { useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * A second explanation, for when the first one did not land.
 *
 * The bank's explanation says why the right answer is right. Someone who picked
 * a wrong one held a specific belief that led them there, and fixed text cannot
 * know what it was. This sends the option they actually chose, so the answer
 * can address that rather than repeating the model answer louder.
 *
 * Only offered on a wrong answer. Asking someone who got it right whether they
 * are confused is a small insult, and it would spend quota on people who do not
 * need it.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

export default function DeeperExplanation({ q, picked }) {
  const [state, setState] = useState("idle");
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  async function ask() {
    setState("loading");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/explain`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          question: q.q,
          options: q.opts,
          correct: q.ans,
          picked,
          explanation: q.exp,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't get an explanation.");

      setDetail(body);
      setState("done");
    } catch (e) {
      setError(e.message);
      setState("idle");
    }
  }

  if (state === "done" && detail) {
    return (
      <div className="q-deeper" data-in="rise">
        {detail.whyWrong && (
          <p className="q-deeper-row">
            <span className="q-deeper-label">Where it went wrong</span>
            {detail.whyWrong}
          </p>
        )}
        <p className="q-deeper-row">
          <span className="q-deeper-label">Why it&apos;s {q.opts[q.ans]}</span>
          {detail.whyRight}
        </p>
        {detail.remember && (
          <p className="q-deeper-keep">{detail.remember}</p>
        )}
      </div>
    );
  }

  return (
    <div className="q-deeper-ask">
      <button
        type="button"
        className="btn-press q-deeper-btn"
        onClick={ask}
        disabled={state === "loading"}
      >
        {state === "loading" ? "Working it out…" : "Still don't get it?"}
      </button>
      {error && <span className="q-deeper-error">{error}</span>}
    </div>
  );
}
