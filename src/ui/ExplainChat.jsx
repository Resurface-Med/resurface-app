import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { splitMarks } from "../lib/formatExplain";

/**
 * Inline tutor dock beside the question — no auto-explain, only what the
 * student asks (quick prompts or free text).
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

const QUICK = [
  {
    label: "Explain further",
    message: "In 2–3 simple sentences, explain only why the correct answer is right. No extra topics.",
  },
  {
    label: "Why was I wrong?",
    message: "In 1–2 sentences, say why my pick was wrong. Name the one thing I confused.",
  },
  {
    label: "One line to remember",
    message: "One sentence only — the single fact worth remembering for the exam.",
  },
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendPrompt(label, apiText) {
    const trimmed = (apiText || label).trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError("");
    setDraft("");

    const userMsg = { id: `u-${Date.now()}`, role: "user", text: label, apiText: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = nextMessages
        .slice(0, -1)
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({
          role: m.role,
          text: m.apiText || m.text,
        }));

      const res = await fetch(`${API_BASE}/api/explain`, {
        method: "POST",
        headers: authHeaders(session?.access_token),
        body: JSON.stringify({
          ...contextBody(q, picked),
          message: trimmed,
          history,
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
      if (apiText === undefined) setDraft(label);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void sendPrompt(text, text);
  }

  const empty = messages.length === 0 && !sending;

  return (
    <aside className="ai-dock" aria-label="Resurface AI">
      <header className="ai-dock__head">
        <h2 className="ai-dock__brand" aria-label="Resurface AI">
          <img
            src="/logo-lockup.png"
            alt=""
            width="560"
            height="131"
            className="ai-dock__logo"
          />
          <span className="ai-dock__suffix">AI</span>
        </h2>
        <button type="button" className="ai-dock__close btn-press" onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div ref={threadRef} className="ai-dock__thread">
        {empty && (
          <div className="ai-dock__intro">
            <p className="ai-dock__empty">Tap a prompt or type below.</p>
            <div className="ai-dock__quick">
              {QUICK.map(({ label, message }) => (
                <button
                  key={label}
                  type="button"
                  className="ai-dock__quick-btn btn-press"
                  disabled={sending}
                  onClick={() => void sendPrompt(label, message)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`ai-dock__msg is-${msg.role}`}>
            <p className="ai-dock__bubble">
              <ExplainText text={msg.text} />
            </p>
          </div>
        ))}

        {sending && (
          <p className="ai-dock__wait" aria-live="polite">
            <span className="ai-dock__dots" aria-hidden="true">
              <span /><span /><span />
            </span>
            Thinking…
          </p>
        )}

        {error && (
          <p className="ai-dock__error" role="alert">{error}</p>
        )}
      </div>

      <footer className="ai-dock__foot">
        {!empty && (
          <div className="ai-dock__quick ai-dock__quick--compact">
            {QUICK.map(({ label, message }) => (
              <button
                key={label}
                type="button"
                className="ai-dock__quick-chip btn-press"
                disabled={sending}
                onClick={() => void sendPrompt(label, message)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <form className="ai-dock__compose" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask a follow-up…"
            disabled={sending}
            className="ai-dock__input"
            aria-label="Your question"
          />
          <button
            type="submit"
            className="ai-dock__send btn-press"
            disabled={sending || !draft.trim()}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 12V4M8 4L5 7M8 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </footer>
    </aside>
  );
}
