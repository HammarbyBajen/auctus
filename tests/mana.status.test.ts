import { describe, expect, it } from "vitest";
import { bannerFor, staleAfterMs, type SyncStatus } from "@/lib/mana/status";

const now = new Date("2026-10-09T12:00:00Z");
const base: SyncStatus = {
  configured: true,
  lastSuccessAt: new Date("2026-10-09T03:10:00Z"),
  running: null,
  failure: null,
  members: 460,
  memberships: 380,
  recentRuns: [],
};

describe("bannerFor", () => {
  it("says nothing when Mana is not set up", () => {
    expect(bannerFor({ ...base, configured: false, lastSuccessAt: null }, now)).toBeNull();
  });

  it("says nothing when the last sync was recent and went well", () => {
    expect(bannerFor(base, now)).toBeNull();
  });

  it("warns in red when the latest sync failed, with the reason", () => {
    const banner = bannerFor({ ...base, failure: { at: now, error: "Mana-nyckeln fungerar inte (nekad åtkomst)." } }, now);
    expect(banner).toEqual({ tone: "red", kind: "failed", error: "Mana-nyckeln fungerar inte (nekad åtkomst)." });
  });

  it("shows progress while a sync is running", () => {
    expect(bannerFor({ ...base, running: { phase: "memberships", done: 120, total: 456 } }, now)).toEqual({
      tone: "info",
      kind: "running",
      done: 120,
      total: 456,
    });
  });

  it("still reports a failure that is newer than the last success even if a retry is running", () => {
    const banner = bannerFor(
      { ...base, failure: { at: now, error: "x" }, running: { phase: "users", done: 0, total: null } },
      now,
    );
    expect(banner?.kind).toBe("failed");
  });

  it("warns in amber when nothing has ever succeeded", () => {
    expect(bannerFor({ ...base, lastSuccessAt: null }, now)).toEqual({ tone: "amber", kind: "never" });
  });

  it("warns in amber when the last good sync is older than 36 hours, and not before", () => {
    const justInside = new Date(now.getTime() - staleAfterMs + 1000);
    const justOutside = new Date(now.getTime() - staleAfterMs - 1000);
    expect(bannerFor({ ...base, lastSuccessAt: justInside }, now)).toBeNull();
    expect(bannerFor({ ...base, lastSuccessAt: justOutside }, now)).toMatchObject({ tone: "amber", kind: "stale" });
  });
});
