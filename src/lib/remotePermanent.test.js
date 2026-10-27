import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
const { isPermanent } = await import("./remote");

/* Which refusals the write queue gives up on (2026-10-27). */
describe("isPermanent", () => {
  it("drops what the server will never take", () => {
    for (const code of ["22008", "22P02", "23505", "23514", "42501", "42703", "PGRST204"]) {
      expect(isPermanent({ code })).toBe(true);
    }
  });
  it("retries everything else", () => {
    for (const e of [{ code: "PGRST301" }, { code: "08006" }, { message: "Failed to fetch" }, new Error("timeout"), null, undefined]) {
      expect(isPermanent(e)).toBe(false);
    }
  });
});
