import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { questionImageUrl } from "../lib/questionImage";

/**
 * A question's image, if it has one.
 *
 * The question stores a storage path, not a URL — the bucket is private, so
 * the URL is signed and expires. Resolving it here keeps that out of the
 * question shape entirely: nothing that stores or syncs a question ever holds
 * a link that can go stale.
 *
 * Drawn into a frame of fixed height rather than at its natural size. An
 * uncapped image ran to about 470px on a 4:3 photo and pushed the options off
 * the bottom of the screen; a frame also means every image question has the
 * same geometry, so the option rows do not move as you go through a session.
 * What the frame costs is detail, which is what the full-screen view is for —
 * histology is never legible inline at any size worth giving it.
 */
export default function QuestionImage({ path }) {
  const [url, setUrl] = useState(null);
  const [zoomed, setZoomed] = useState(false);

  /* No synchronous reset here. The previous question's URL is cleared by the
     key on the call site remounting this, which costs nothing and keeps the
     effect to the one thing it is for. */
  useEffect(() => {
    let cancelled = false;
    if (!path) return;
    questionImageUrl(path).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path]);

  /* Escape closes it, and the page underneath stops scrolling while it is
     open — a trackpad flick over a full-screen overlay otherwise moves the
     question you came back to. */
  useEffect(() => {
    if (!zoomed) return;
    const onKey = e => { if (e.key === "Escape") setZoomed(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [zoomed]);

  if (!path) return null;

  /* Not alt="", which would claim the image is decorative. It is the question:
     without it there is nothing to answer. There is no honest description to
     give of a slide the app has never seen, so this says what it is and stops
     there. */
  const alt = "Image for this question";

  return (
    <>
      <button
        type="button"
        className={url ? "q-image is-loaded" : "q-image"}
        onClick={() => url && setZoomed(true)}
        aria-label="View image full screen"
      >
        {url && <img src={url} alt={alt} />}
        {url && (
          <span className="q-image__zoom" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.4 10.4L14 14M7 5.2v3.6M5.2 7h3.6"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </button>

      {/* Portalled to the body, not left where it is written. .q-card carries a
          transform for the life of the card — scaleIn ends at scale(1) with
          fill-mode both, so the value persists rather than resetting to none —
          and any transform makes an element the containing block for the fixed
          positioning inside it. Rendered in place, a full-screen overlay would
          be confined to the card. It is the same reason the edit modal is
          written outside the card element rather than inside it. */}
      {zoomed && createPortal((
        <div
          className="q-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Question image"
          onClick={() => setZoomed(false)}
        >
          <img src={url} alt={alt} />
          <button
            type="button"
            className="q-lightbox__close"
            aria-label="Close image"
            onClick={() => setZoomed(false)}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ), document.body)}
    </>
  );
}
