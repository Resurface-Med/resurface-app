import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * A one-shot chat after a wrong answer.
 *
 * Tapping Ask Resurface AI *is* the question — there is no composer, because
 * the API cannot continue a conversation. The option they picked shows as
 * their bubble; the three replies land one after another.
 *
 * On a desk this sits under the bank explanation. On a phone it takes the
 * whole screen, so the close control has to be obvious: that is the only way
 * back to the card.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

const STAGGER_MS = 280;

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ExplainChat({ q, picked, onClose }) {
  const [state, setState] = useState("loading");
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let live = true;
    setState("loading");
    setDetail(null);
    setError("");
    setShown(0);

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

    return () => { live = false; };
  }, [q, picked, attempt]);

  const replies = detail
    ? [
        detail.whyWrong && { k: "why", text: detail.whyWrong },
        detail.whyRight && { k: "right", text: detail.whyRight },
        detail.remember && { k: "keep", text: detail.remember },
      ].filter(Boolean)
    : [];

  useEffect(() => {
    if (state !== "done" || replies.length === 0) return;
    if (prefersReducedMotion()) {
      setShown(replies.length);
      return;
    }
    setShown(1);
    const timers = replies.slice(1).map((_, i) =>
      setTimeout(() => setShown(i + 2), STAGGER_MS * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
    // replies is rebuilt each render; length + texts are what we actually wait on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, detail]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // A phone overlay would otherwise scroll the practice screen underneath.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const chose = Number.isInteger(picked) && q.opts[picked] ? q.opts[picked] : null;
  const letter = Number.isInteger(picked) ? "ABCDE"[picked] : null;

  return (
    <div className="ai-chat" role="region" aria-label="Resurface AI">
      <header className="ai-chat-head">
        <div className="ai-chat-brand">
          <span className="ai-chat-mark" aria-hidden="true" />
          Resurface AI
        </div>
        <button type="button" className="ai-chat-close btn-press" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="ai-chat-thread" aria-live="polite">
        {chose && (
          <p className="ai-bubble is-you">
            I went with {letter} — {chose}
          </p>
        )}

        {state === "loading" && (
          <div className="ai-bubble is-ai is-typing">
            <span className="ai-chat-dots" aria-hidden="true"><i /><i /><i /></span>
            Looking at what you picked…
          </div>
        )}

        {state === "error" && (
          <div className="ai-bubble is-ai is-error">
            <p>{error}</p>
            <button
              type="button"
              className="ai-chat-retry btn-press"
              onClick={() => setAttempt(n => n + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {state === "done" && replies.slice(0, shown).map(msg => (
          <p
            key={msg.k}
            className={`ai-bubble is-ai${msg.k === "keep" ? " is-keep" : ""}`}
          >
            {msg.text}
          </p>
        ))}
      </div>
    </div>
  );
}
