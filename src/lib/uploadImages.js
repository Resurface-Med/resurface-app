import { IMAGE_LINE, noteImages } from "./formatExplain";

/**
 * Pictures named in uploaded questions (2026-11-04). The JSON names files
 * — a note's ![caption](file.png) lines and a question's `img` — and the
 * files themselves are chosen next to it. These match the two up, list what
 * is missing, and on Add swap each name for the path it was stored under.
 *
 * Names match on the file name alone, ignoring case and any folder, since
 * Claude may write "images/Loop.png" for a file saved as loop.png.
 */

/** A name as it is matched: no folder, lower case. */
export const keyOf = name => String(name ?? "").split(/[\\/]/).pop().trim().toLowerCase();

/** Already stored: a /qimg/ file or a path in the bucket (uid/uuid.webp). */
const stored = ref => ref.startsWith("/") || /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.\w+$/i.test(ref);

/** Every file the drafts name that is not stored yet, once each. */
export function namedFiles(drafts) {
  const out = new Set();
  for (const d of drafts ?? []) {
    if (d.img && !stored(d.img)) out.add(keyOf(d.img));
    for (const ref of noteImages(d.topic?.body)) if (!stored(ref)) out.add(keyOf(ref));
  }
  return [...out];
}

/** The pictures one draft names, as keys, in order. */
export function draftFiles(d) {
  return [...(d.img && !stored(d.img) ? [keyOf(d.img)] : []),
    ...noteImages(d.topic?.body).filter(r => !stored(r)).map(keyOf)];
}

/**
 * Drafts with every named file swapped for its stored path (`paths`: key →
 * path). A name with no path is taken out: the note's line goes, and the
 * question keeps no image, so nothing draws an empty frame.
 */
export function withPaths(drafts, paths) {
  const swap = ref => (stored(ref) ? ref : paths[keyOf(ref)] ?? null);
  return drafts.map(d => {
    const next = { ...d };
    if (d.img) { const p = swap(d.img); if (p) next.img = p; else delete next.img; }
    if (d.topic?.body) {
      const body = d.topic.body.split(/\r?\n/).flatMap(line => {
        const m = line.trim().match(IMAGE_LINE);
        if (!m) return [line];
        const p = swap(m[2]);
        return p ? [`![${m[1]}](${p})`] : [];
      }).join("\n");
      next.topic = { ...d.topic, body };
    }
    return next;
  });
}
