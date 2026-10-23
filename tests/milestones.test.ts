import { describe, expect, it } from "vitest";
import { crossed, fillMilestone, weekOf, weeksInARow } from "@/lib/mana/milestones";

describe("milestones (ticket 35)", () => {
  it("knows the Monday of a week", () => {
    expect(weekOf("2026-10-26")).toBe("2026-10-26");
    expect(weekOf("2026-11-01")).toBe("2026-10-26");
    expect(weekOf("2026-10-25")).toBe("2026-10-19");
  });

  it("counts weeks in a row on from Mana's figure", () => {
    const base = { streak: 8, readOn: "2026-10-12", readWeekCounted: true };
    // A class in each of the two weeks after the read, and this week: 8 + 3.
    expect(weeksInARow(["2026-10-21", "2026-10-28", "2026-11-03"], "2026-11-04", base)).toBe(11);
    // Nothing yet this week: the run up to last week stands.
    expect(weeksInARow(["2026-10-21", "2026-10-28"], "2026-11-04", base)).toBe(10);
    // A week missed after the read: the run starts again.
    expect(weeksInARow(["2026-10-21", "2026-11-03"], "2026-11-04", base)).toBe(1);
    // Two weeks with nothing: no run at all.
    expect(weeksInARow(["2026-10-21"], "2026-11-04", base)).toBe(0);
  });

  it("adds a first visit in the week Mana's figure was read, after it was read", () => {
    const readEarly = { streak: 9, readOn: "2026-10-12", readWeekCounted: false };
    expect(weeksInARow(["2026-10-14"], "2026-10-19", readEarly)).toBe(10);
    expect(weeksInARow(["2026-10-14"], "2026-10-19", { ...readEarly, readWeekCounted: true })).toBe(9);
  });

  it("finds the milestones crossed since the last check, and none on the first", () => {
    expect(crossed(95, 101, [100, 250])).toEqual([100]);
    expect(crossed(240, 520, [500, 100, 250])).toEqual([250, 500]);
    expect(crossed(100, 100, [100])).toEqual([]);
    expect(crossed(null, 883, [100, 250, 500, 1000])).toEqual([]);
  });

  it("fills in the template", () => {
    expect(fillMilestone("Hej {förnamn}, {antal} pass!", "Anna Andersson", 1000)).toBe("Hej Anna, 1\u00a0000 pass!");
  });
});
