import { useEffect, useState } from "react";
import QuestionCard from "../ui/QuestionCard";
import { OF } from "../ui/theme";
import { QUESTIONS, loadDecks } from "../data";

/**
 * Public marketing preview of the real practice session UI — no auth.
 * Served at /preview/practice and framed inside the landing hero laptop.
 */
function pickQuestion() {
  const preferred = QUESTIONS.find(
    (q) =>
      q.opts?.length === 5 &&
      q.q.length < 70 &&
      (q.deck === "Physiology" || /pH|cardiac|receptor|membrane/i.test(q.q)),
  );
  return preferred || QUESTIONS.find((q) => q.opts?.length === 5) || QUESTIONS[0];
}

export default function PracticePreview() {
  const [q, setQ] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.add("is-practice-preview");
    loadDecks().then(() => setQ(pickQuestion()));
    return () => document.documentElement.classList.remove("is-practice-preview");
  }, []);

  if (!q) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--c-bg, #3562f5)" }}>
        <div style={{ color: "var(--c-on-field, #fff)", fontSize: 15, fontWeight: 500, opacity: 0.9 }}>
          Loading…
        </div>
      </div>
    );
  }

  const topic = q.deck || "Practice";

  return (
    <div className="practice-preview">
      <div
        className="session-wrap"
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "18px 24px 28px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{
              flexShrink: 0,
              background: "rgba(255,255,255,0.12)",
              borderRadius: "var(--r-pill)",
              padding: "8px 16px",
              color: OF.text,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Exit
          </span>
          <span
            style={{
              fontSize: 14,
              color: OF.soft,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {topic}
          </span>
          <span
            style={{
              marginLeft: "auto",
              flexShrink: 0,
              fontSize: 14,
              fontWeight: 600,
              color: OF.text,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            3 / 20
          </span>
        </div>

        <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: "15%",
              background: "var(--c-field-object)",
              borderRadius: 99,
            }}
          />
        </div>

        <QuestionCard
          q={q}
          sel={null}
          onAnswer={() => {}}
          onNext={() => {}}
          onPrev={() => {}}
          onToggleBookmark={() => {}}
          isBookmarked={false}
          isLast={false}
          nextLabel="Next question"
        />
      </div>
    </div>
  );
}
