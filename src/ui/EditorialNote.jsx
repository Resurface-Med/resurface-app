import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { parseBlocks, stripImages } from "../lib/formatExplain";
import { questionImageUrl } from "../lib/questionImage";
import { MarkedText } from "./RichText";

/* A picture in a note (2026-11-04): small, so it sits in the note rather
   than taking it over, with its caption beside it; tapping opens it full
   screen in the same viewer as a question's image. The path is the stored
   one (or a /qimg/ file), its link worked out when drawn. */
function NoteImage({ src, alt }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(null); setFailed(false);
    questionImageUrl(src).then(u => { if (!live) return; if (u) setUrl(u); else setFailed(true); });
    return () => { live = false; };
  }, [src]);
  useEffect(() => {
    if (!zoomed) return;
    const onKey = e => { if (e.key === "Escape") setZoomed(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [zoomed]);
  if (failed) return null;
  return (
    <figure className="ed__fig">
      <button type="button" className="ed__fig-btn" onClick={() => url && setZoomed(true)} aria-label={`Open ${alt || "picture"} full screen`}>
        {url ? <img src={url} alt={alt || ""} loading="lazy" /> : <span className="ed__fig-wait" aria-hidden="true" />}
        {url && (
          <span className="q-image__zoom" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.4 10.4L14 14M7 5.2v3.6M5.2 7h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </button>
      {alt && <figcaption>{alt}</figcaption>}
      {zoomed && createPortal((
        <div className="q-lightbox" role="dialog" aria-modal="true" aria-label={alt || "Picture"} onClick={() => setZoomed(false)}>
          <img src={url} alt={alt || ""} />
          {alt && <p className="ed__lightbox-cap">{alt}</p>}
          <button type="button" className="q-lightbox__close" aria-label="Close picture" onClick={() => setZoomed(false)}>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ), document.body)}
    </figure>
  );
}

/**
 * A topic note laid out like an article (2026-10-29): the first paragraph
 * as a lede, each **Heading** paragraph starting a numbered section
 * (01, 02…), ==one line== under a highlighter, in a reading serif.
 */
export default function EditorialNote({ text }) {
  const blocks = parseBlocks(text, { images: true });
  const isHead = b => b.type === "p" && /^\*\*[^*]+\*\*$/.test(b.text.trim());
  /* Each heading's section number, worked out before drawing. */
  const numbers = blocks.reduce((acc, b, i) => {
    acc.push(i > 0 && isHead(b) ? (acc.filter(Boolean).length + 1) : 0);
    return acc;
  }, []);
  return (
    <div className="ed">
      {blocks.map((b, i) => {
        if (b.type === "img") return <NoteImage key={i} src={b.src} alt={b.alt} />;
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
  const words = stripImages(text).replace(/[*=#-]/g, " ").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
