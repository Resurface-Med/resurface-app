import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { splitMarks } from "../lib/formatExplain";

/**
 * Inline tutor dock beside the question — no auto-explain, only what the
 * student asks (quick prompts or free text). Cap: 3 asks per question.
 */

const API_BASE = import.meta.env.VITE_API_BASE
  || (import.meta.env.DEV ? "http://localhost:3001" : "https://api.tryresurface.com");

const ASK_LIMIT = 3;
const ASK_STORE = "rs_ai_asks";

const QUICK = [
  {
    label: "Explain concept in simpler terms",
    message: "In 2–3 short sentences, explain the idea in simpler words. No extra topics.",
  },
  {
    label: "Give me a memory tip",
    message: "One sentence only — a memory hook for the exam.",
  },
  {
    label: "Show me an example",
    message: "One short clinical or exam-style example. Two sentences max.",
  },
];

function loadUsed(questionId) {
  if (questionId == null) return 0;
  try {
    const map = JSON.parse(localStorage.getItem(ASK_STORE) || "{}");
    const n = Number(map[String(questionId)]);
    return Number.isFinite(n) ? Math.min(ASK_LIMIT, Math.max(0, n)) : 0;
  } catch {
    return 0;
  }
}

function saveUsed(questionId, used) {
  if (questionId == null) return;
  try {
    const map = JSON.parse(localStorage.getItem(ASK_STORE) || "{}");
    map[String(questionId)] = Math.min(ASK_LIMIT, Math.max(0, used));
    localStorage.setItem(ASK_STORE, JSON.stringify(map));
  } catch {
    /* ignore quota persistence failures */
  }
}

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
    questionId: q.id,
    question: q.q,
    options: q.opts,
    correct: q.ans,
    picked,
    explanation: q.exp,
  };
}

function QuickPills({ sending, disabled, onPick }) {
  return (
    <div className="ai-dock__pills">
      {QUICK.map(({ label, message }) => (
        <button
          key={label}
          type="button"
          className="ai-dock__pill btn-press"
          disabled={sending || disabled}
          onClick={() => onPick(label, message)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function ExplainChat({ q, picked, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [used, setUsed] = useState(() => loadUsed(q.id));
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  const remaining = Math.max(0, ASK_LIMIT - used);
  const atLimit = remaining <= 0;

  function isPhone() {
    return window.matchMedia("(max-width: 900px)").matches
      || window.matchMedia("(pointer: coarse)").matches;
  }

  useEffect(() => {
    setUsed(loadUsed(q.id));
    setMessages([]);
    setDraft("");
    setError("");
  }, [q.id]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (isPhone() || atLimit) return;
    inputRef.current?.focus();
  }, [atLimit]);

  function markUsed(nextUsed) {
    const capped = Math.min(ASK_LIMIT, Math.max(0, nextUsed));
    setUsed(capped);
    saveUsed(q.id, capped);
  }

  async function sendPrompt(label, apiText) {
    const trimmed = (apiText || label).trim();
    if (!trimmed || sending || atLimit) return;

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
      if (!res.ok) {
        if (res.status === 429 && body?.remaining === 0) {
          markUsed(ASK_LIMIT);
        }
        throw new Error(body?.error || "Couldn't get a reply.");
      }

      if (typeof body.remaining === "number") {
        markUsed(ASK_LIMIT - body.remaining);
      } else {
        markUsed(used + 1);
      }

      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: body.reply, rating: null },
      ]);
    } catch (e) {
      setError(e.message);
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      if (apiText === undefined) setDraft(label);
    } finally {
      setSending(false);
      if (!isPhone() && !atLimit) inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || atLimit) return;
    void sendPrompt(text, text);
  }

  function rate(id, value) {
    setMessages(prev => prev.map(m => (
      m.id === id ? { ...m, rating: m.rating === value ? null : value } : m
    )));
  }

  return (
    <aside className="ai-dock" aria-label="Resurface AI">
      <header className="ai-dock__head">
        <h2 className="ai-dock__brand" aria-label="Resurface AI">
          <img
            src="/books.webp"
            alt=""
            width="64"
            height="64"
            className="ai-dock__mark"
          />
          <span className="ai-dock__suffix">
            <span className="ai-dock__name">Resurface </span>
            <span className="ai-dock__ai">AI</span>
          </span>
        </h2>
        <button type="button" className="ai-dock__close btn-press" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div ref={threadRef} className="ai-dock__thread">
        {messages.map(msg => (
          <div key={msg.id} className={`ai-dock__msg is-${msg.role}`}>
            {msg.role === "assistant" ? (
              <div className="ai-dock__reply">
                <p className="ai-dock__bubble">
                  <ExplainText text={msg.text} />
                </p>
                <div className="ai-dock__rate">
                  <button
                    type="button"
                    className={`ai-dock__rate-btn${msg.rating === "up" ? " is-on" : ""}`}
                    aria-label="Helpful"
                    aria-pressed={msg.rating === "up"}
                    onClick={() => rate(msg.id, "up")}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M5 7.5V13H3.2A1.2 1.2 0 012 11.8V8.7A1.2 1.2 0 013.2 7.5H5zm0 0l1.7-4.1A1.4 1.4 0 018.1 2.5h.2c.7 0 1.2.7 1 1.4L8.8 6h3.5a1.7 1.7 0 011.6 2.2l-.8 3.2A2 2 0 0111.2 13H5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`ai-dock__rate-btn${msg.rating === "down" ? " is-on" : ""}`}
                    aria-label="Not helpful"
                    aria-pressed={msg.rating === "down"}
                    onClick={() => rate(msg.id, "down")}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M5 8.5V3H3.2A1.2 1.2 0 002 4.2v3.1A1.2 1.2 0 003.2 8.5H5zm0 0l1.7 4.1a1.4 1.4 0 001.4 1H8.3c.7 0 1.2-.7 1-1.4L8.8 10H12.3a1.7 1.7 0 001.6-2.2l-.8-3.2A2 2 0 0011.2 3H5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <p className="ai-dock__bubble">
                <ExplainText text={msg.text} />
              </p>
            )}
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
        {atLimit && (
          <p className="ai-dock__quota" role="status">
            No more AI responses on this question — try another.
          </p>
        )}
        {!atLimit && remaining === 1 && (
          <p className="ai-dock__quota" aria-live="polite">
            1 AI response left on this question
          </p>
        )}
        {!atLimit && messages.length === 0 && (
          <QuickPills
            sending={sending}
            disabled={atLimit}
            onPick={(label, message) => void sendPrompt(label, message)}
          />
        )}
        {!atLimit && (
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12V4M8 4L5 7M8 4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        )}
      </footer>
    </aside>
  );
}
