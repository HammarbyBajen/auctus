import { describe, expect, it } from "vitest";
import { syncModeFor } from "@/lib/mana/sync";

const at = (iso: string) => new Date(iso);

describe("full or partial sync (ticket 28)", () => {
  it("is full when nothing has succeeded yet", () => {
    expect(syncModeFor({ today: "2026-10-20", now: at("2026-10-20T03:00:00Z"), lastSuccessAt: null, lastFull: null })).toBe("full");
  });

  it("is partial on an ordinary night after a recent full pass", () => {
    const lastFull = { startedAt: at("2026-10-19T03:00:00Z"), day: "2026-10-19" };
    expect(syncModeFor({ today: "2026-10-20", now: at("2026-10-20T03:00:00Z"), lastSuccessAt: at("2026-10-19T03:00:00Z"), lastFull })).toBe("partial");
  });

  it("is full on the night to Monday, once that day", () => {
    const lastFull = { startedAt: at("2026-10-19T03:00:00Z"), day: "2026-10-19" };
    const monday = { today: "2026-10-26", now: at("2026-10-26T03:00:00Z"), lastSuccessAt: at("2026-10-25T03:00:00Z") };
    expect(syncModeFor({ ...monday, lastFull })).toBe("full");
    // "Synka nu" later that Monday: the full pass has already run today.
    expect(syncModeFor({ ...monday, now: at("2026-10-26T12:00:00Z"), lastFull: { startedAt: at("2026-10-26T03:00:00Z"), day: "2026-10-26" } })).toBe("partial");
  });

  it("is full when the last full pass is a week old, whatever the day", () => {
    const lastFull = { startedAt: at("2026-10-14T03:00:00Z"), day: "2026-10-14" };
    expect(syncModeFor({ today: "2026-10-21", now: at("2026-10-21T03:00:00Z"), lastSuccessAt: at("2026-10-20T03:00:00Z"), lastFull })).toBe("full");
  });
});
