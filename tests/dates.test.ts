import { describe, expect, it } from "vitest";
import { dueState, isGreyedOut, todayInStockholm } from "@/lib/tasks/dates";

describe("todayInStockholm", () => {
  it("uses Tegen's calendar day, not UTC (summer time, UTC+2)", () => {
    expect(todayInStockholm(new Date("2026-10-09T12:00:00Z"))).toBe("2026-10-09");
    // 22:30 UTC is already half past midnight the next day in Stockholm.
    expect(todayInStockholm(new Date("2026-10-09T22:30:00Z"))).toBe("2026-10-10");
    expect(todayInStockholm(new Date("2026-10-09T21:59:00Z"))).toBe("2026-10-09");
  });

  it("handles winter time (UTC+1) and the new year", () => {
    expect(todayInStockholm(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(todayInStockholm(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });
});

describe("dueState", () => {
  it("is overdue the day after, due today on the day, later before", () => {
    expect(dueState("2026-10-08", "2026-10-09")).toBe("overdue");
    expect(dueState("2026-10-09", "2026-10-09")).toBe("today");
    expect(dueState("2026-10-10", "2026-10-09")).toBe("later");
  });
});

describe("isGreyedOut", () => {
  it("greys out only leads that belong to somebody else", () => {
    expect(isGreyedOut(null, "me")).toBe(false);
    expect(isGreyedOut(undefined, "me")).toBe(false);
    expect(isGreyedOut("me", "me")).toBe(false);
    expect(isGreyedOut("someone-else", "me")).toBe(true);
  });
});
