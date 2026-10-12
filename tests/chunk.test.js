import { describe, it, expect } from "vitest";
import { looksLikeMissingChunk } from "../src/lib/chunk.js";

/*
 * This decides whether to reload the page, so both directions cost
 * something. A miss leaves somebody looking at "Failed to fetch dynamically
 * imported module" with no way forward. A false positive reloads the page
 * under them for an error that had nothing to do with a stale build, which
 * is worse — their work goes with it.
 */
describe("looksLikeMissingChunk", () => {
  it("catches what browsers actually say for a chunk that has gone", () => {
    const real = [
      // Chrome, and the one Jacob saw
      "Failed to fetch dynamically imported module: https://app.tryresurface.com/assets/sql-wasm-browser-DaRimnOu.js",
      // Safari
      "Importing a module script failed.",
      // Firefox, when the rewrite hands back index.html for a missing .js
      "Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
    ];
    for (const message of real) {
      expect(looksLikeMissingChunk(new Error(message))).toBe(true);
    }
  });

  it("catches a ChunkLoadError by name, whatever it says", () => {
    const e = new Error("anything");
    e.name = "ChunkLoadError";
    expect(looksLikeMissingChunk(e)).toBe(true);
  });

  /* The ones that must not trigger a reload: a reload would throw away
     whatever the person was doing and not fix any of them. */
  it("ignores errors that are not about a missing chunk", () => {
    const notChunks = [
      "Cannot read properties of undefined (reading 'map')",
      "The model returned invalid JSON. Try again.",
      "new row violates row-level security policy",
      "Give the deck a name first.",
      "Unexpected token '<'",
    ];
    for (const message of notChunks) {
      expect(looksLikeMissingChunk(new Error(message))).toBe(false);
    }
  });

  it("does not fall over on a thrown non-error", () => {
    expect(looksLikeMissingChunk(null)).toBe(false);
    expect(looksLikeMissingChunk(undefined)).toBe(false);
    expect(looksLikeMissingChunk("Failed to fetch")).toBe(true);
  });
});
