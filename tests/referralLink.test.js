import { describe, it, expect } from "vitest";
import {
  referralCodeFromPath, referralCodeFromSearch, rememberReferral, pendingReferral, forgetReferral, REFERRAL_MAX_AGE,
} from "../src/lib/referralLink";

function memory() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

describe("referral links", () => {
  it("reads a code from /r/<10 hex> or ?r=", () => {
    expect(referralCodeFromPath("/r/0a1b2c3d4e")).toBe("0a1b2c3d4e");
    expect(referralCodeFromPath("/r/0a1b2c3d4e/")).toBe("0a1b2c3d4e");
    expect(referralCodeFromPath("/f/0a1b2c3d4e")).toBe(null);
    expect(referralCodeFromSearch("?r=0a1b2c3d4e")).toBe("0a1b2c3d4e");
    expect(referralCodeFromSearch("?r=nope")).toBe(null);
  });
  it("keeps a code through a reload, then lapses after seven days", () => {
    const s = memory();
    rememberReferral("0a1b2c3d4e", 1000, s);
    expect(pendingReferral(2000, s)).toBe("0a1b2c3d4e");
    expect(pendingReferral(1000 + REFERRAL_MAX_AGE, s)).toBe(null);
  });
  it("ignores bad codes and forgets on request", () => {
    const s = memory();
    rememberReferral("nope", 0, s);
    expect(pendingReferral(1, s)).toBe(null);
    rememberReferral("0a1b2c3d4e", 0, s);
    forgetReferral(s);
    expect(pendingReferral(1, s)).toBe(null);
  });
});
