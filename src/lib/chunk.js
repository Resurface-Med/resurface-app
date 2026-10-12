/**
 * Loading a chunk from a build that no longer exists.
 *
 * Every lazy part of the app is a file named by the hash of its contents, so
 * a deploy replaces `sql-wasm-browser-DaRimnOu.js` with
 * `sql-wasm-browser-BU0Utilb.js`. A tab opened before that deploy is still
 * running the old index, still asking for the old name, and the old name is
 * gone — so the first time it reaches for a part it has not downloaded yet,
 * it fails. Not on load, which would be obvious: later, on whichever button
 * happens to need a chunk first. Jacob got it on Anki import.
 *
 * The rewrite that makes deep links work turns it into something worse than
 * a 404. A missing /assets/*.js returns index.html with a 200, so the
 * browser downloads HTML, tries to run it as a module, and reports "Failed
 * to fetch dynamically imported module" — which reads like the feature is
 * broken for everybody rather than like this tab being out of date.
 *
 * There is nothing to fix in the chunk. The page is simply old, and the
 * answer is to get a new one. Reload once and the fresh index names the
 * chunks that exist.
 *
 * Once, via sessionStorage: if the reload does not fix it — the asset is
 * genuinely missing, the network is down — a second attempt would be an
 * endless refresh loop, which is a worse failure than an error message. The
 * flag clears on success, so a tab left open across two deploys recovers
 * from both.
 */

const FLAG = "pq_chunk_reload";

/** True for the handful of ways a browser reports a chunk it cannot run. */
export function looksLikeMissingChunk(err) {
  const msg = String(err?.message || err || "");
  return (
    err?.name === "ChunkLoadError" ||
    /dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /expected a JavaScript(-or-Wasm)? module/i.test(msg) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(msg)
  );
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem(FLAG)) return false;
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* Private mode, or storage refused. One reload is still better than an
       error nobody can act on; the risk is a loop that the user can stop by
       closing the tab, against a feature that is certainly broken. */
  }
  window.location.reload();
  return true;
}

/** Called after the app has rendered, so the next stale chunk can reload. */
export function chunkLoadedOk() {
  try { sessionStorage.removeItem(FLAG); } catch { /* nothing to clear */ }
}

/**
 * Wraps a dynamic import so a stale chunk reloads the page instead of
 * throwing something unreadable at whoever pressed the button.
 *
 * Named `chunk`, not `lazy`: React's lazy is already in App.jsx and wraps
 * the result of this one.
 */
export function chunk(load) {
  return async (...args) => {
    try {
      return await load(...args);
    } catch (err) {
      if (looksLikeMissingChunk(err) && reloadOnce()) {
        /* The page is going away. Never resolving is correct: resolving with
           nothing would let the caller carry on and fail somewhere less
           explicable than here. */
        return new Promise(() => {});
      }
      throw err;
    }
  };
}
