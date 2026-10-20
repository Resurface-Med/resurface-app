import { describe, it, expect } from "vitest";
import { rememberShare, pendingShare, forgetShare, PENDING_MAX_AGE } from "../src/lib/pendingShare.js";

function store() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}
const CODE = "a1b2c3d4e5f6";

describe("pending share link", () => {
  it("survives a reload: remembered, then read back", () => {
    const s = store();
    rememberShare(CODE, 1000, s);
    expect(pendingShare(2000, s)).toBe(CODE);
  });

  it("is forgotten once answered", () => {
    const s = store();
    rememberShare(CODE, 1000, s);
    forgetShare(s);
    expect(pendingShare(2000, s)).toBeNull();
  });

  it("lapses after three days, and clears itself", () => {
    const s = store();
    rememberShare(CODE, 0, s);
    expect(pendingShare(PENDING_MAX_AGE - 1, s)).toBe(CODE);
    expect(pendingShare(PENDING_MAX_AGE, s)).toBeNull();
    expect(s.m.size).toBe(0);
  });

  it("keeps the latest link when a second is opened", () => {
    const s = store();
    rememberShare(CODE, 0, s);
    rememberShare("ffffffffffff", 10, s);
    expect(pendingShare(20, s)).toBe("ffffffffffff");
  });

  it("ignores anything that is not a share code, and junk in storage", () => {
    const s = store();
    rememberShare("../../etc", 0, s);
    expect(pendingShare(1, s)).toBeNull();
    s.setItem("pq_pending_share", "{not json");
    expect(pendingShare(1, s)).toBeNull();
    s.setItem("pq_pending_share", JSON.stringify({ code: CODE, at: 5000 }));
    expect(pendingShare(1000, s)).toBeNull();   // from the future: a clock change
  });

  it("does nothing, and does not throw, when storage is refused", () => {
    const refused = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
    expect(() => rememberShare(CODE, 0, refused)).not.toThrow();
    expect(pendingShare(0, refused)).toBeNull();
    expect(() => forgetShare(refused)).not.toThrow();
  });
});
