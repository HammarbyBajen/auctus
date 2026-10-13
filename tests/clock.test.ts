import { describe, expect, it } from "vitest";
import { addRunningHours, allWeekdays, clockRunsOn } from "@/lib/home/clock";

const always = { clockDays: allWeekdays, daysOff: [] };
const weekdays = { clockDays: [1, 2, 3, 4, 5], daysOff: [] };
// Swedish time: CEST (UTC+2) until 25 Oct 2026, then CET (UTC+1).
const se = (local: string, offset = 2) => new Date(`${local}:00+0${offset}:00`);

describe("the deadline clock", () => {
  it("is plain clock time when every day runs", () => {
    expect(addRunningHours(se("2026-10-14T20:00"), 24, always)).toEqual(se("2026-10-15T20:00"));
  });

  it("pauses over a skipped weekend: a Friday-evening lead is due Monday evening", () => {
    // Friday 16 Oct 20:00: 4 hours left on Friday, then Monday from midnight.
    expect(addRunningHours(se("2026-10-16T20:00"), 24, weekdays)).toEqual(se("2026-10-19T20:00"));
  });

  it("starts counting at the next running day when the lead arrives on a skipped day", () => {
    // Saturday night 17 Oct 23:00: nothing counts until Monday 00:00.
    expect(addRunningHours(se("2026-10-17T23:00"), 24, weekdays)).toEqual(se("2026-10-20T00:00"));
  });

  it("skips single days off too, and handles the change to winter time", () => {
    const clock = { clockDays: allWeekdays, daysOff: ["2026-10-25"] };
    // Saturday 24 Oct 12:00 (summer time) + 24 running hours, with Sunday 25 Oct off (the 25-hour day).
    expect(addRunningHours(se("2026-10-24T12:00"), 24, clock)).toEqual(se("2026-10-26T12:00", 1));
    expect(clockRunsOn("2026-10-25", clock)).toBe(false);
  });

  it("has no deadline when no weekday runs", () => {
    expect(addRunningHours(se("2026-10-14T20:00"), 24, { clockDays: [], daysOff: [] })).toBeNull();
  });
});
