import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { splitMarks } from "../lib/formatExplain";

/**
 * A centred window after a wrong answer — not a drawer, not a chatbot.
 *
 * The card already showed which row was red and which was green. This window
 * restates that in words so the prose underneath has a subject, then explains
 * the miss. Close (or the blurred surround, or Escape) puts you back.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

const STAGGER_MS = 280;
const LETTERS = "ABCDE";

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ExplainText({ text }) {
  return splitMarks(text).map((part, i) => {
    if (part.kind === "strong") return <strong key={i}>{part.text}</strong>;
    if (part.kind === "em") return <em key={i}>{part.text}</em>;
    return <span key={i}>{part.text}</span>;
  });
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
        detail.whyWrong && {
          k: "why",
          lead: "Why that isn't right",
          text: detail.whyWrong,
        },
        detail.whyRight && {
          k: "right",
          lead: `Why the answer is ${LETTERS[q.ans]}`,
          text: detail.whyRight,
        },
        detail.remember && {
          k: "keep",
          lead: "Worth remembering",
          text: detail.remember,
        },
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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const chose = Number.isInteger(picked) && q.opts[picked] ? q.opts[picked] : null;
  const letter = Number.isInteger(picked) ? LETTERS[picked] : null;

  return createPortal(
    <div
      className="ai-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="ai-chat"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-title"
      >
        <header className="ai-chat-head">
          <h2 id="ai-chat-title" className="ai-chat-brand">Resurface AI</h2>
          <button type="button" className="ai-chat-close btn-press" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="ai-chat-about">
          <p className="ai-chat-q">{q.q}</p>
          {chose && (
            <p className="ai-chat-pick is-bad">
              <span>You picked</span>
              {letter} — {chose}
            </p>
          )}
          {!chose && (
            <p className="ai-chat-pick is-bad">
              <span>You picked</span>
              nothing — time ran out
            </p>
          )}
          <p className="ai-chat-pick is-ok">
            <span>Answer</span>
            {LETTERS[q.ans]} — {q.opts[q.ans]}
          </p>
        </div>

        <div className="ai-chat-thread" aria-live="polite">
          {state === "loading" && (
            <p className="ai-chat-wait">
              {letter ? `Looking at ${letter}…` : "Looking at this…"}
            </p>
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
            <div
              key={msg.k}
              className={`ai-bubble is-ai${msg.k === "keep" ? " is-keep" : ""}`}
            >
              <p className="ai-bubble-lead">{msg.lead}</p>
              <p className="ai-bubble-body"><ExplainText text={msg.text} /></p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.getElementById("root") || document.body,
  );
}
