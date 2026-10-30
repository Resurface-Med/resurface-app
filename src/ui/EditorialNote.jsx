import { parseBlocks } from "../lib/formatExplain";
import { MarkedText } from "./RichText";

/**
 * A topic note laid out like an article (2026-10-29): the first paragraph
 * as a lede, each **Heading** paragraph starting a numbered section
 * (01, 02…), ==one line== under a highlighter, in a reading serif.
 */
export default function EditorialNote({ text }) {
  const blocks = parseBlocks(text);
  const isHead = b => b.type === "p" && /^\*\*[^*]+\*\*$/.test(b.text.trim());
  /* Each heading's section number, worked out before drawing. */
  const numbers = blocks.reduce((acc, b, i) => {
    acc.push(i > 0 && isHead(b) ? (acc.filter(Boolean).length + 1) : 0);
    return acc;
  }, []);
  return (
    <div className="ed">
      {blocks.map((b, i) => {
        if (i === 0 && b.type === "p") return <p key={i} className="ed__lede"><MarkedText text={b.text} /></p>;
        if (numbers[i]) {
          return (
            <h4 key={i} className="ed__h">
              <span className="ed__n">{String(numbers[i]).padStart(2, "0")}</span>
              <MarkedText text={b.text.trim().slice(2, -2)} />
            </h4>
          );
        }
        if (b.type === "p") return <p key={i} className="ed__p"><MarkedText text={b.text} /></p>;
        const List = b.type === "ol" ? "ol" : "ul";
        return <List key={i} className="ed__list">{b.items.map((t, j) => <li key={j}><MarkedText text={t} /></li>)}</List>;
      })}
    </div>
  );
}

/** "1 min read" at about 200 words a minute. */
export function readTime(text) {
  const words = String(text || "").replace(/[*=#-]/g, " ").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
