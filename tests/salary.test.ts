import { describe, expect, it } from "vitest";
import { calculateMonth, monthOptions, pullWindow, type Category, type Work } from "@/lib/salary/calc";
import { crc32, exportSheet, toCsv, toXlsx } from "@/lib/salary/export";

let n = 0;
const work = (startsAt: string, minutes: number, extra: Partial<Work> = {}): Work => {
  const start = new Date(startsAt);
  return {
    id: `w${++n}`,
    source: "class",
    typeKey: "class:crossfit",
    typeLabel: "CrossFit",
    instructorId: "i-anna",
    startsAt: start,
    endsAt: new Date(start.getTime() + minutes * 60_000),
    status: null,
    ...extra,
  };
};
const coaches = [
  { id: "i-anna", name: "Anna", hourlyRateOre: 25_000 },
  { id: "i-bo", name: "Bo" },
];
const pt = (status: string, extra: Partial<Work> = {}) => work("2026-10-08T12:00:00+02:00", 60, { source: "service", typeKey: "service:pt60", typeLabel: "PT60", status, ...extra });
const meeting = (startsAt: string, minutes: number) => work(startsAt, minutes, { typeKey: "class:mote", typeLabel: "Tegenmöte" });
const month = (work: Work[], categories: Category[] = []) => calculateMonth({ month: "2026-10", coaches, categories, work });

describe("the pull window", () => {
  it("covers the month in Tegen's time, at most a week per request", () => {
    const w = pullWindow("2026-10");
    expect(w.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // October ends on winter time.
    expect(w.to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(w.weeks).toHaveLength(5);
    expect(w.weeks.at(-1)!.to).toEqual(w.to);
    expect(w.weeks[0].to).toEqual(w.weeks[1].from);
  });
});

describe("hours per coach", () => {
  it("come from real minutes, so a 30-minute class is half an hour", () => {
    const r = month([work("2026-10-06T07:00:00+02:00", 30), work("2026-10-07T17:00:00+02:00", 60)]);
    expect(r.coaches).toEqual([{ coachId: "i-anna", name: "Anna", byType: { "class:crossfit": 1.5 }, total: 1.5, hourlyRateOre: 25_000, amountOre: 37_500 }]);
  });

  it("are split by category: classes, PT and courses", () => {
    const r = month([
      work("2026-10-06T07:00:00+02:00", 60),
      pt("completed"),
      work("2026-10-10T10:00:00+02:00", 45, { source: "course", typeKey: "course:kids", typeLabel: "TEGEN KIDS" }),
    ]);
    expect(r.coaches[0].byType).toEqual({ "class:crossfit": 1, "service:pt60": 1, "course:kids": 0.75 });
    expect(r.coaches[0].total).toBe(2.75);
    expect(r.types.map((t) => [t.label, t.counted])).toEqual([
      ["CrossFit", true],
      ["PT60", true],
      ["TEGEN KIDS", true],
    ]);
  });

  it("leave out work outside the month, and coaches who did not work", () => {
    const r = month([work("2026-09-30T18:00:00+02:00", 60), work("2026-11-01T10:00:00+01:00", 60)]);
    expect(r.coaches).toEqual([]);
  });

  it("give an amount from counted hours and the gross rate per hour, and none at all without a rate", () => {
    const result = month([work("2026-10-01T17:00:00+02:00", 90), work("2026-10-02T17:00:00+02:00", 60, { instructorId: "i-bo" })]);
    const anna = result.coaches.find((c) => c.coachId === "i-anna")!;
    const bo = result.coaches.find((c) => c.coachId === "i-bo")!;
    // 1.5 h × 250 kr = 375 kr, in öre.
    expect([anna.hourlyRateOre, anna.amountOre]).toEqual([25_000, 37_500]);
    expect([bo.hourlyRateOre, bo.amountOre]).toEqual([null, null]);
    // A category an owner left out pays nothing.
    const leftOut = month([work("2026-10-01T17:00:00+02:00", 90)], [{ typeKey: "class:crossfit", label: "CrossFit", source: "class", counted: false }]);
    expect(leftOut.coaches[0].amountOre).toBe(0);
  });

  it("count a PT booking only when completed, and list the others by status", () => {
    const r = month([pt("completed"), pt("canceled"), pt("no_show"), pt("booked")]);
    expect(r.coaches[0].byType["service:pt60"]).toBe(1);
    expect(r.notCounted).toEqual({ canceled: 1, no_show: 1, booked: 1 });
  });

  it("leave a category an owner left out out of the total, but still show it", () => {
    const r = month([work("2026-10-06T07:00:00+02:00", 60), meeting("2026-10-06T19:00:00+02:00", 90)], [{ typeKey: "class:mote", label: "Tegenmöte", source: "class", counted: false }]);
    expect(r.coaches[0].byType).toEqual({ "class:crossfit": 1, "class:mote": 1.5 });
    expect(r.coaches[0].total).toBe(1);
  });

  it("flag a class with no instructor, and keep hours for an instructor Mana no longer lists", () => {
    const r = month([work("2026-10-06T10:00:00+02:00", 60, { instructorId: null }), work("2026-10-06T11:00:00+02:00", 60, { instructorId: "i-borta-1234" })]);
    expect(r.unassigned).toHaveLength(1);
    expect(r.coaches.map((c) => [c.name, c.total])).toEqual([["Okänd instruktör (i-borta-)", 1]]);
  });

  it("are sorted by name", () => {
    const r = month([work("2026-10-06T07:00:00+02:00", 60, { instructorId: "i-bo" }), work("2026-10-06T09:00:00+02:00", 60)]);
    expect(r.coaches.map((c) => c.name)).toEqual(["Anna", "Bo"]);
  });
});

describe("months", () => {
  it("lists the months since Mana, newest first", () => {
    expect(monthOptions("2027-01-10")).toEqual(["2027-01", "2026-12", "2026-11", "2026-10", "2026-09"]);
  });
});

describe("export", () => {
  const result = calculateMonth({
    month: "2026-10",
    coaches: [{ id: "i-anna", name: "Åsa Öberg", hourlyRateOre: 20_050 }],
    categories: [{ typeKey: "class:mote", label: "Tegenmöte", source: "class", counted: false }],
    work: [work("2026-10-05T07:00:00+02:00", 60), work("2026-10-06T07:00:00+02:00", 90), meeting("2026-10-06T19:00:00+02:00", 60)],
  });

  it("has one column per counted category and decimal hours", () => {
    const sheet = exportSheet(result);
    expect(sheet.header).toEqual(["Namn", "CrossFit", "Timmar totalt", "Timlön (kr)", "Att betala (kr)"]);
    // 2.5 h × 200,50 kr = 501,25 kr.
    expect(sheet.rows).toEqual([["Åsa Öberg", 2.5, 2.5, 200.5, 501.25]]);
  });

  it("writes CSV for Swedish Excel", () => {
    const csv = toCsv(exportSheet(result));
    expect(csv.startsWith("﻿Namn;CrossFit;")).toBe(true);
    expect(csv).toContain("Åsa Öberg;2,5;2,5;200,5;501,25");
  });

  it("writes a zip that holds the workbook", () => {
    const bytes = toXlsx(exportSheet(result), "Oktober 2026");
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("Åsa Öberg");
    expect(text).toContain("<v>2.5</v>");
  });

  it("checksums like zip does", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
