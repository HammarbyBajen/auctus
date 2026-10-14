import { describe, expect, it } from "vitest";
import { calculateMonth, mondayOf, pullWindow, type Person, type Rule, type Work } from "@/lib/salary/calc";
import { crc32, exportSheet, toCsv, toXlsx } from "@/lib/salary/export";

let n = 0;
const work = (startsAt: string, minutes: number, extra: Partial<Work> = {}): Work => {
  const start = new Date(startsAt);
  return {
    id: `w${++n}`,
    source: "class",
    typeKey: "class:wod",
    typeLabel: "WOD",
    instructorId: "i-anna",
    startsAt: start,
    endsAt: new Date(start.getTime() + minutes * 60_000),
    status: null,
    ...extra,
  };
};
const anna: Person = { id: "p-anna", name: "Anna", manaInstructorId: "i-anna", freeClassesPerWeek: 0, activeFrom: null };
const rules: Rule[] = [
  { typeKey: "class:wod", label: "WOD", source: "class", paid: true },
  { typeKey: "class:open", label: "Open gym", source: "class", paid: false },
  { typeKey: "class:shop", label: "Tegenbutik", source: "class", paid: true },
  { typeKey: "service:pt60", label: "PT60", source: "service", paid: true },
];

describe("weeks and the pull window", () => {
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
  });

  it("covers whole weeks around the month, one window per week", () => {
    const w = pullWindow("2026-10");
    expect(w.from.toISOString()).toBe("2026-09-27T22:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-01T23:00:00.000Z");
    expect(w.weeks).toHaveLength(5);
    expect(w.weeks[0].to).toEqual(w.weeks[1].from);
  });
});

describe("hours", () => {
  it("come from real minutes, a 30-minute class is half an hour", () => {
    const r = calculateMonth({ month: "2026-10", people: [anna], rules, work: [work("2026-10-06T07:00:00+02:00", 30), work("2026-10-07T17:00:00+02:00", 60)] });
    expect(r.people[0].byType["class:wod"]).toBe(1.5);
    expect(r.people[0].toPay).toBe(1.5);
  });

  it("leave out work outside the month", () => {
    const r = calculateMonth({ month: "2026-10", people: [anna], rules, work: [work("2026-09-30T18:00:00+02:00", 60), work("2026-11-01T10:00:00+01:00", 60)] });
    expect(r.people[0].byType).toEqual({});
  });

  it("count a PT booking only when completed, and list the others by status", () => {
    const pt = (status: string) => work("2026-10-08T12:00:00+02:00", 60, { source: "service", typeKey: "service:pt60", typeLabel: "PT60", status });
    const r = calculateMonth({ month: "2026-10", people: [anna], rules, work: [pt("completed"), pt("canceled"), pt("no_show"), pt("booked")] });
    expect(r.people[0].byType["service:pt60"]).toBe(1);
    expect(r.notCounted).toEqual({ canceled: 1, no_show: 1, booked: 1 });
  });

  it("do not pay a kind marked unpaid", () => {
    const r = calculateMonth({ month: "2026-10", people: [anna], rules, work: [work("2026-10-06T10:00:00+02:00", 60, { typeKey: "class:open", typeLabel: "Open gym" })] });
    expect(r.people[0].byType["class:open"]).toBe(1);
    expect(r.people[0].toPay).toBe(0);
  });

  it("flag a kind with no rule yet and do not pay it, but still show it", () => {
    const r = calculateMonth({ month: "2026-10", people: [anna], rules, work: [work("2026-10-06T10:00:00+02:00", 45, { typeKey: "class:new", typeLabel: "Nytt pass" })] });
    expect(r.types).toEqual([{ typeKey: "class:new", label: "Nytt pass", source: "class", paid: null }]);
    expect(r.people[0].byType["class:new"]).toBe(0.75);
    expect(r.people[0].toPay).toBe(0);
  });

  it("flag a class with no instructor, or one nobody is linked to", () => {
    const r = calculateMonth({
      month: "2026-10",
      people: [anna],
      rules,
      work: [work("2026-10-06T10:00:00+02:00", 60, { instructorId: null }), work("2026-10-06T11:00:00+02:00", 60, { instructorId: "i-okand" })],
    });
    expect(r.unassigned.map((u) => u.instructorId)).toEqual([null, "i-okand"]);
    expect(r.people[0].byType).toEqual({});
  });
});

describe("free classes", () => {
  const coach = { ...anna, freeClassesPerWeek: 2 };

  it("are the first classes of each week, in time order", () => {
    const r = calculateMonth({
      month: "2026-10",
      people: [coach],
      rules,
      work: [work("2026-10-09T17:00:00+02:00", 60), work("2026-10-05T07:00:00+02:00", 30), work("2026-10-06T07:00:00+02:00", 60), work("2026-10-12T07:00:00+02:00", 60)],
    });
    const p = r.people[0];
    expect(p.freeClasses).toBe(3);
    expect(p.freeHours).toBe(2.5);
    expect(p.toPay).toBe(1);
  });

  it("are decided over a whole week that spans two months, and booked to the month each class falls in", () => {
    // Week of Monday 28 September: two classes in September, two in October.
    const week = [work("2026-09-29T17:00:00+02:00", 60), work("2026-09-30T17:00:00+02:00", 60), work("2026-10-01T17:00:00+02:00", 60), work("2026-10-02T17:00:00+02:00", 60)];
    const sep = calculateMonth({ month: "2026-09", people: [coach], rules, work: week }).people[0];
    const oct = calculateMonth({ month: "2026-10", people: [coach], rules, work: week }).people[0];
    expect([sep.freeClasses, sep.toPay]).toEqual([2, 0]);
    expect([oct.freeClasses, oct.toPay]).toEqual([0, 2]);
  });

  it("never use Tegenbutik, PT or unpaid classes, which are paid as usual", () => {
    const r = calculateMonth({
      month: "2026-10",
      people: [coach],
      rules,
      work: [
        work("2026-10-05T07:00:00+02:00", 60, { typeKey: "class:shop", typeLabel: "Tegenbutik" }),
        work("2026-10-05T08:00:00+02:00", 60, { typeKey: "class:open", typeLabel: "Open gym" }),
        work("2026-10-05T09:00:00+02:00", 60, { source: "service", typeKey: "service:pt60", typeLabel: "PT60", status: "completed" }),
        work("2026-10-05T17:00:00+02:00", 60),
      ],
    });
    const p = r.people[0];
    expect(p.freeClasses).toBe(1);
    expect(p.toPay).toBe(2);
  });

  it("apply only from the active-from day (a part-time deal starting mid-month)", () => {
    const partTime = { ...anna, freeClassesPerWeek: 1, activeFrom: "2026-10-14" };
    const r = calculateMonth({
      month: "2026-10",
      people: [partTime],
      rules,
      work: [work("2026-10-12T17:00:00+02:00", 60), work("2026-10-13T17:00:00+02:00", 60), work("2026-10-15T17:00:00+02:00", 60), work("2026-10-16T17:00:00+02:00", 60)],
    });
    const p = r.people[0];
    expect(p.freeClasses).toBe(1);
    expect(p.toPay).toBe(3);
  });

  it("use the Tegen week, so a Sunday evening class belongs to the week that ends then", () => {
    const one = { ...anna, freeClassesPerWeek: 1 };
    const r = calculateMonth({
      month: "2026-10",
      people: [one],
      // Sunday 11 October 23:30 in Stockholm is Sunday 21:30 UTC: still the week of 5 October.
      work: [work("2026-10-05T17:00:00+02:00", 60), work("2026-10-11T23:30:00+02:00", 30)],
      rules,
    });
    expect(r.people[0].freeClasses).toBe(1);
    expect(r.people[0].toPay).toBe(0.5);
  });
});

describe("export", () => {
  const result = calculateMonth({
    month: "2026-10",
    people: [{ ...anna, name: "Åsa Öberg", freeClassesPerWeek: 1 }],
    rules,
    work: [work("2026-10-05T07:00:00+02:00", 60), work("2026-10-06T07:00:00+02:00", 90)],
  });

  it("has one column per kind and decimal hours", () => {
    const sheet = exportSheet(result);
    expect(sheet.header).toEqual(["Namn", "WOD", "Fria pass", "Fria timmar", "Timmar att betala"]);
    expect(sheet.rows).toEqual([["Åsa Öberg", 2.5, 1, 1, 1.5]]);
  });

  it("writes CSV for Swedish Excel", () => {
    const csv = toCsv(exportSheet(result));
    expect(csv.startsWith("﻿Namn;WOD;")).toBe(true);
    expect(csv).toContain("Åsa Öberg;2,5;1;1;1,5");
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
