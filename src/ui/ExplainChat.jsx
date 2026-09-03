import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { splitMarks } from "../lib/formatExplain";

/**
 * Side-panel tutor over a missed question — initial structured explanation,
 * then follow-up chat on the same GEMINI_EXPLAIN key.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

const LETTERS = "ABCDE";

const SUGGESTIONS = [
  "Explain that more simply",
  "Why was my answer tempting?",
  "What's the one line to remember?",
  "Walk me through the correct answer",
];

function ExplainText({ text }) {
  return splitMarks(text).map((part, i) => {
    if (part.kind === "strong") return <strong key={i}>{part.text}</strong>;
    if (part.kind === "em") return <em key={i}>{part.text}</em>;
    return <span key={i}>{part.text}</span>;
  });
}

function authHeaders(token) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token ?? ""}`,
  };
}

function contextBody(q, picked) {
  return {
    question: q.q,
    options: q.opts,
    correct: q.ans,
    picked,
    explanation: q.exp,
  };
}

export default function ExplainChat({ q, picked, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  const letter = Number.isInteger(picked) ? LETTERS[picked] : null;
  const chose = Number.isInteger(picked) && q.opts[picked] ? q.opts[picked] : null;
  const right = LETTERS[q.ans];

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    setMessages([]);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${API_BASE}/api/explain`, {
          method: "POST",
          headers: authHeaders(session?.access_token),
          body: JSON.stringify(contextBody(q, picked)),
        });
        const body = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) throw new Error(body?.error || "Couldn't get an explanation.");

        const initial = [
          body.whyWrong && {
            id: "why",
            role: "assistant",
            title: letter ? `Why ${letter} isn't right` : "Why that isn't right",
            text: body.whyWrong,
          },
          body.whyRight && {
            id: "right",
            role: "assistant",
            title: `Why it's ${right}`,
            text: body.whyRight,
          },
          body.remember && {
            id: "keep",
            role: "assistant",
            title: "Take this",
            text: body.remember,
            keep: true,
          },
        ].filter(Boolean);

        setMessages(initial);
        setBusy(false);
      } catch (e) {
        if (!live) return;
        setError(e.message);
        setBusy(false);
      }
    })();

    return () => { live = false; };
  }, [q, picked, attempt]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, sending]);

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
    document.body.classList.add("ai-panel-open");
    return () => { document.body.classList.remove("ai-panel-open"); };
  }, []);

  async function sendFollowUp(text) {
    const trimmed = text.trim();
    if (!trimmed || sending || busy) return;

    setSending(true);
    setError("");
    setDraft("");

    const userMsg = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = nextMessages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role, text: m.text }));

      const res = await fetch(`${API_BASE}/api/explain`, {
        method: "POST",
        headers: authHeaders(session?.access_token),
        body: JSON.stringify({
          ...contextBody(q, picked),
          message: trimmed,
          history: history.slice(0, -1),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't get a reply.");

      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: body.reply },
      ]);
    } catch (e) {
      setError(e.message);
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setDraft(trimmed);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    void sendFollowUp(draft);
  }

  return createPortal(
    <div className="ai-panel-root">
      <button
        type="button"
        className="ai-panel-scrim"
        aria-label="Close chat"
        onClick={onClose}
      />

      <aside
        className="ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-panel-title"
      >
        <header className="ai-panel-head">
          <h2 id="ai-panel-title" className="ai-panel-title">Chat with AI</h2>
          <button type="button" className="ai-panel-close btn-press" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={threadRef} className="ai-panel-thread">
          <p className="ai-panel-context">{q.q}</p>

          <div className="ai-panel-chips">
            <p className="ai-chip is-bad">
              <span className="ai-chip-kicker">You</span>
              {letter && <span className="ai-chip-letter">{letter}</span>}
              <span className="ai-chip-text">{chose || "nothing — time ran out"}</span>
            </p>
            <p className="ai-chip is-ok">
              <span className="ai-chip-kicker">Ans</span>
              <span className="ai-chip-letter">{right}</span>
              <span className="ai-chip-text">{q.opts[q.ans]}</span>
            </p>
          </div>

          {busy && <p className="ai-panel-wait">One moment…</p>}

          {!busy && error && messages.length === 0 && (
            <div className="ai-panel-error">
              <p>{error}</p>
              <button type="button" className="ai-chat-retry btn-press" onClick={() => setAttempt(n => n + 1)}>
                Try again
              </button>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`ai-panel-msg is-${msg.role}${msg.keep ? " is-keep" : ""}`}
            >
              {msg.title && <span className="ai-panel-msg-label">{msg.title}</span>}
              <p className="ai-panel-bubble">
                <ExplainText text={msg.text} />
              </p>
            </div>
          ))}

          {sending && <p className="ai-panel-wait">Thinking…</p>}
          {error && messages.length > 0 && (
            <p className="ai-panel-inline-error" role="alert">{error}</p>
          )}
        </div>

        <div className="ai-panel-suggestions">
          <span className="ai-panel-suggestions-label">Suggestions</span>
          <div className="ai-panel-suggestion-grid">
            {SUGGESTIONS.map(label => (
              <button
                key={label}
                type="button"
                className="ai-panel-suggestion btn-press"
                disabled={busy || sending}
                onClick={() => void sendFollowUp(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <form className="ai-panel-compose" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask a follow-up…"
            disabled={busy || sending}
            className="ai-panel-input"
            aria-label="Follow-up question"
          />
          <button
            type="submit"
            className="ai-panel-send btn-press"
            disabled={busy || sending || !draft.trim()}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 12V4M8 4L5 7M8 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </aside>
    </div>,
    document.body,
  );
}
