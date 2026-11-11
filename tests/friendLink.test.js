import { describe, it, expect } from "vitest";
import { friendCodeFromPath, rememberFriend, pendingFriend, forgetFriend, FRIEND_MAX_AGE } from "../src/lib/friendLink";

function memory() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

describe("friend links", () => {
  it("reads a code only from /f/<10 hex>", () => {
    expect(friendCodeFromPath("/f/0a1b2c3d4e")).toBe("0a1b2c3d4e");
    expect(friendCodeFromPath("/f/0a1b2c3d4e/")).toBe("0a1b2c3d4e");
    expect(friendCodeFromPath("/d/0a1b2c3d4e5f")).toBe(null);
    expect(friendCodeFromPath("/f/XYZ")).toBe(null);
    expect(friendCodeFromPath("/f/0a1b2c3d4e5f")).toBe(null);
  });
  it("keeps a code through a reload, then lapses after three days", () => {
    const s = memory();
    rememberFriend("0a1b2c3d4e", 1000, s);
    expect(pendingFriend(2000, s)).toBe("0a1b2c3d4e");
    expect(pendingFriend(1000 + FRIEND_MAX_AGE, s)).toBe(null);
    expect(pendingFriend(2000, s)).toBe(null);
  });
  it("ignores bad codes and forgets on request", () => {
    const s = memory();
    rememberFriend("nope", 0, s);
    expect(pendingFriend(1, s)).toBe(null);
    rememberFriend("0a1b2c3d4e", 0, s);
    forgetFriend(s);
    expect(pendingFriend(1, s)).toBe(null);
  });
});
