import { describe, expect, it } from "vitest";
import { parseThresholdsForm } from "@/lib/home/thresholds-form";

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const base = { firstContactHours: "24", warnHoursBeforeDeadline: "4", stalledDays: "7" };

describe("parseThresholdsForm", () => {
  it("reads the limits, the running weekdays and the days off, tidied", () => {
    const fields = { ...base, "stalled.contacted": "3", "stalled.price_info": "5", clockDays: ["5", "1", "3", "1"], daysOff: "2026-12-25\n2026-12-24, 2026-12-24" };
    expect(parseThresholdsForm(form(fields))).toEqual({
      ok: true,
      value: {
        firstContactHours: 24,
        warnHoursBeforeDeadline: 4,
        stalledDays: 7,
        stalledDaysByStage: { contacted: 3, price_info: 5 },
        clockDays: [1, 3, 5],
        daysOff: ["2026-12-24", "2026-12-25"],
      },
    });
  });

  it("allows no running day at all, which means no first-contact deadline", () => {
    expect(parseThresholdsForm(form(base))).toMatchObject({ ok: true, value: { clockDays: [], daysOff: [] } });
  });

  it("says which field is wrong", () => {
    expect(parseThresholdsForm(form({ ...base, firstContactHours: "0" }))).toEqual({ ok: false, error: "firstContact" });
    expect(parseThresholdsForm(form({ ...base, firstContactHours: "2.5" }))).toEqual({ ok: false, error: "firstContact" });
    expect(parseThresholdsForm(form({ ...base, warnHoursBeforeDeadline: "24" }))).toEqual({ ok: false, error: "warn" });
    expect(parseThresholdsForm(form({ ...base, stalledDays: "200" }))).toEqual({ ok: false, error: "stalled" });
    expect(parseThresholdsForm(form({ ...base, "stalled.contacted": "0" }))).toEqual({ ok: false, error: "stalled" });
    expect(parseThresholdsForm(form({ ...base, daysOff: "2026-02-30" }))).toEqual({ ok: false, error: "daysOff" });
    expect(parseThresholdsForm(form({ ...base, daysOff: "julafton" }))).toEqual({ ok: false, error: "daysOff" });
  });
});
