import { describe, expect, it } from "vitest";
import {
  buildAttention,
  formatSpan,
  type AttentionLead,
  type AttentionTask,
  type Thresholds,
} from "@/lib/home/attention";
import { mondayOfWeek, startOfDayInStockholm, startOfMonthInStockholm, startOfWeekInStockholm } from "@/lib/home/time";

const thresholds: Thresholds = { firstContactHours: 24, warnHoursBeforeDeadline: 4, stalledDays: 7 };
const now = new Date("2026-10-09T10:00:00Z");
const today = "2026-10-09";
const H = 3_600_000;
const D = 86_400_000;
const ago = (ms: number) => new Date(now.getTime() - ms);

let n = 0;
function lead(overrides: Partial<AttentionLead> = {}): AttentionLead {
  n += 1;
  return {
    id: `lead-${n}`,
    personName: `Person ${n}`,
    phone: null,
    stage: "new_lead",
    stageKind: "open",
    createdAt: ago(1 * H),
    updatedAt: ago(1 * H),
    assignedToId: null,
    assigneeName: null,
    ...overrides,
  };
}
function run(leads: AttentionLead[], tasks: AttentionTask[] = [], scope: "mine" | "all" = "all", viewerId = "me") {
  return buildAttention({ leads, tasks, now, today, thresholds, viewerId, scope });
}

describe("first contact deadline", () => {
  it("is red once the 24 hours have passed", () => {
    const [item] = run([lead({ createdAt: ago(25 * H) })]);
    expect(item.severity).toBe("red");
    expect(item.reasons[0]).toMatchObject({ type: "first_contact_overdue" });
  });

  it("is amber when 4 hours or less remain", () => {
    expect(run([lead({ createdAt: ago(20 * H) })])[0].severity).toBe("amber"); // exactly 4 h left
    expect(run([lead({ createdAt: ago(23 * H) })])[0].severity).toBe("amber");
  });

  it("is normal while more than 4 hours remain", () => {
    const [item] = run([lead({ createdAt: ago(19 * H) })]);
    expect(item.severity).toBe("normal");
    expect(item.reasons[0]).toMatchObject({ type: "first_contact_ok" });
  });

  it("is overdue the moment the deadline is crossed, not before", () => {
    expect(run([lead({ createdAt: ago(24 * H) })])[0].reasons[0].type).toBe("first_contact_soon");
    expect(run([lead({ createdAt: ago(24 * H + 1) })])[0].reasons[0].type).toBe("first_contact_overdue");
  });

  it("follows the thresholds that are set", () => {
    const [item] = buildAttention({
      leads: [lead({ createdAt: ago(3 * H) })],
      tasks: [],
      now,
      today,
      thresholds: { firstContactHours: 2, warnHoursBeforeDeadline: 1, stalledDays: 7 },
      viewerId: "me",
      scope: "all",
    });
    expect(item.severity).toBe("red");
  });

  it("does not apply to a lead that has been contacted", () => {
    expect(run([lead({ stage: "contacted", createdAt: ago(40 * H), updatedAt: ago(1 * H) })])).toEqual([]);
  });
});

describe("tasks", () => {
  const withTask = (dueDate: string): AttentionTask => ({ id: "t", leadId: "", title: "Ring", dueDate });

  it("lists overdue tasks in red and tasks due today in amber, and ignores later ones", () => {
    const a = lead({ stage: "contacted" });
    const b = lead({ stage: "contacted" });
    const c = lead({ stage: "contacted" });
    const items = run([a, b, c], [
      { ...withTask("2026-10-08"), leadId: a.id },
      { ...withTask("2026-10-09"), leadId: b.id },
      { ...withTask("2026-10-10"), leadId: c.id },
    ]);
    expect(items.map((i) => [i.lead.id, i.severity])).toEqual([
      [a.id, "red"],
      [b.id, "amber"],
    ]);
  });
});

describe("stalled leads", () => {
  it("appears after 7 days without activity", () => {
    const [item] = run([lead({ stage: "price_info", updatedAt: ago(7 * D) })]);
    expect(item.reasons[0]).toMatchObject({ type: "stalled", days: 7 });
    expect(item.severity).toBe("normal");
  });

  it("does not appear before 7 days", () => {
    expect(run([lead({ stage: "price_info", updatedAt: ago(7 * D - 1) })])).toEqual([]);
  });

  it("does not count a lead that has an open task as stalled", () => {
    const l = lead({ stage: "price_info", updatedAt: ago(30 * D) });
    expect(run([l], [{ id: "t", leadId: l.id, title: "Ring", dueDate: "2026-10-20" }])).toEqual([]);
  });

  it("never lists won or cold leads", () => {
    expect(run([lead({ stage: "won", stageKind: "won", updatedAt: ago(90 * D) })])).toEqual([]);
    expect(run([lead({ stage: "cold", stageKind: "cold", updatedAt: ago(90 * D) })])).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts overdue first contact first, then overdue tasks, amber, today, stalled, then the rest", () => {
    const stalled = lead({ stage: "price_info", updatedAt: ago(10 * D) });
    const okNew = lead({ createdAt: ago(2 * H) });
    const taskToday = lead({ stage: "contacted" });
    const amberNew = lead({ createdAt: ago(22 * H) });
    const taskLate = lead({ stage: "contacted" });
    const redNew = lead({ createdAt: ago(30 * H) });
    const items = run([stalled, okNew, taskToday, amberNew, taskLate, redNew], [
      { id: "1", leadId: taskToday.id, title: "x", dueDate: "2026-10-09" },
      { id: "2", leadId: taskLate.id, title: "y", dueDate: "2026-10-01" },
    ]);
    expect(items.map((i) => i.lead.id)).toEqual([
      redNew.id,
      taskLate.id,
      amberNew.id,
      taskToday.id,
      stalled.id,
      okNew.id,
    ]);
  });

  it("orders by how late within the same kind", () => {
    const a = lead({ createdAt: ago(26 * H) });
    const b = lead({ createdAt: ago(50 * H) });
    const c = lead({ createdAt: ago(30 * H) });
    expect(run([a, b, c]).map((i) => i.lead.id)).toEqual([b.id, c.id, a.id]);
  });

  it("puts the one closest to the deadline first among the amber ones", () => {
    const a = lead({ createdAt: ago(21 * H) });
    const b = lead({ createdAt: ago(23 * H) });
    expect(run([a, b]).map((i) => i.lead.id)).toEqual([b.id, a.id]);
  });

  it("shows a lead once, with all its reasons, under its most urgent one", () => {
    const l = lead({ createdAt: ago(30 * H) });
    const items = run([l], [{ id: "t", leadId: l.id, title: "Ring", dueDate: "2026-10-01" }]);
    expect(items).toHaveLength(1);
    expect(items[0].reasons.map((r) => r.type).sort()).toEqual(["first_contact_overdue", "task_overdue"]);
    expect(items[0].severity).toBe("red");
  });
});

describe("mine and all", () => {
  it("'mine' keeps my leads and unassigned ones, 'all' keeps everything", () => {
    const mine = lead({ createdAt: ago(30 * H), assignedToId: "me" });
    const nobody = lead({ createdAt: ago(30 * H) });
    const theirs = lead({ createdAt: ago(30 * H), assignedToId: "someone-else" });
    expect(run([mine, nobody, theirs], [], "mine", "me").map((i) => i.lead.id).sort()).toEqual(
      [mine.id, nobody.id].sort(),
    );
    expect(run([mine, nobody, theirs], [], "all", "me")).toHaveLength(3);
  });
});

describe("formatSpan", () => {
  it("picks minutes, hours or days", () => {
    expect(formatSpan(40 * 60_000)).toEqual({ unit: "minutes", value: 40 });
    expect(formatSpan(3 * H)).toEqual({ unit: "hours", value: 3 });
    expect(formatSpan(-5 * H)).toEqual({ unit: "hours", value: 5 });
    expect(formatSpan(3 * D)).toEqual({ unit: "days", value: 3 });
  });
});

describe("Stockholm week and month boundaries", () => {
  it("finds Monday, including on a Sunday and a Monday", () => {
    expect(mondayOfWeek(new Date("2026-10-09T10:00:00Z"))).toBe("2026-10-05"); // Friday
    expect(mondayOfWeek(new Date("2026-10-11T10:00:00Z"))).toBe("2026-10-05"); // Sunday
    expect(mondayOfWeek(new Date("2026-10-12T10:00:00Z"))).toBe("2026-10-12"); // Monday
  });

  it("starts a day at local midnight in summer (UTC+2) and in winter (UTC+1)", () => {
    expect(startOfDayInStockholm("2026-10-05").toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(startOfDayInStockholm("2026-12-07").toISOString()).toBe("2026-12-06T23:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    expect(startOfDayInStockholm("2026-10-25").toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(startOfDayInStockholm("2026-10-26").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("gives the start of the week and of the month", () => {
    expect(startOfWeekInStockholm(new Date("2026-10-09T10:00:00Z")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(startOfMonthInStockholm(new Date("2026-10-09T10:00:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // 23:30 UTC on the last day is already the next month in Stockholm.
    expect(startOfMonthInStockholm(new Date("2026-10-31T23:30:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});
