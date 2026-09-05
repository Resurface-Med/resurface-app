import { useEffect, useState } from "react";
import { questionImageUrl } from "../lib/questionImage";

/**
 * A question's image, if it has one.
 *
 * The question stores a storage path, not a URL — the bucket is private, so
 * the URL is signed and expires. Resolving it here keeps that out of the
 * question shape entirely: nothing that stores or syncs a question ever holds
 * a link that can go stale.
 */
export default function QuestionImage({ path }) {
  const [url, setUrl] = useState(null);

  /* No synchronous reset here. The previous question's URL is cleared by the
     key on the call site remounting this, which costs nothing and keeps the
     effect to the one thing it is for. */
  useEffect(() => {
    let cancelled = false;
    if (!path) return;
    questionImageUrl(path).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [path]);

  if (!path) return null;

  return (
    <div className={url ? "q-image is-loaded" : "q-image"}>
      {url && <img src={url} alt="" />}
    </div>
  );
}
