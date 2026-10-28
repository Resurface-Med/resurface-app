import { splitMarks, parseBlocks } from "../lib/formatExplain";

/* Bold and italic inside a line. */
export function MarkedText({ text }) {
  return splitMarks(text).map((part, i) => {
    if (part.kind === "strong") return <strong key={i}>{part.text}</strong>;
    if (part.kind === "em") return <em key={i}>{part.text}</em>;
    return <span key={i}>{part.text}</span>;
  });
}

/* Paragraphs, "- " bullets and "1. " steps, as Resurface AI replies and
   topic notes are written (2026-10-28). */
export default function RichText({ text, className = "ai-md" }) {
  return (
    <div className={className}>
      {parseBlocks(text).map((b, i) => (
        b.type === "p" ? <p key={i}><MarkedText text={b.text} /></p>
          : b.type === "ul" ? <ul key={i}>{b.items.map((t, j) => <li key={j}><MarkedText text={t} /></li>)}</ul>
          : <ol key={i}>{b.items.map((t, j) => <li key={j}><MarkedText text={t} /></li>)}</ol>
      ))}
    </div>
  );
}
