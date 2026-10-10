import { describe, expect, it } from "vitest";
import { countsOn, memberTrend, monthlyRevenue, monthOverMonth, payingMembersOn, rollingMonths, type KpiMembership } from "@/lib/kpi/members";

const m = (over: Partial<KpiMembership>): KpiMembership => ({
  manaUserId: "u1",
  name: "Basic",
  status: "active",
  startDate: "2026-09-23",
  pendingChangeKind: null,
  pendingChangeDate: null,
  priceAmount: 169500,
  ...over,
});

describe("countsOn", () => {
  it("counts a paid membership from its start day", () => {
    expect(countsOn(m({}), "2026-09-22")).toBe(false);
    expect(countsOn(m({}), "2026-09-23")).toBe(true);
  });

  it("leaves out free memberships", () => {
    expect(countsOn(m({ priceAmount: 0 }), "2026-10-01")).toBe(false);
    expect(countsOn(m({ priceAmount: null }), "2026-10-01")).toBe(false);
  });

  it("counts a cancelled membership up to and including its last day", () => {
    const cancelled = m({ status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-10-05" });
    expect(countsOn(cancelled, "2026-10-05")).toBe(true);
    expect(countsOn(cancelled, "2026-10-06")).toBe(false);
  });

  it("stops counting a membership the day its freeze starts", () => {
    const frozen = m({ pendingChangeKind: "freeze", pendingChangeDate: "2026-11-01" });
    expect(countsOn(frozen, "2026-10-31")).toBe(true);
    expect(countsOn(frozen, "2026-11-01")).toBe(false);
  });

  it("never counts an ended membership with no known end", () => {
    expect(countsOn(m({ status: "ended" }), "2026-09-30")).toBe(false);
  });
});

describe("paying members and revenue", () => {
  const memberships = [
    m({ manaUserId: "a" }),
    m({ manaUserId: "a", name: "Förvaringsbox", priceAmount: 5000 }),
    m({ manaUserId: "b", name: "Förvaringsbox", priceAmount: 5000 }),
    m({ manaUserId: "c", name: "Fri träning", priceAmount: 0 }),
    m({ manaUserId: "d", status: "future", startDate: "2026-10-24" }),
  ];

  it("counts a person once however many memberships they hold, and a locker alone counts", () => {
    expect(payingMembersOn(memberships, "2026-10-10")).toBe(2);
    expect(payingMembersOn(memberships, "2026-10-10", "Förvaringsbox")).toBe(2);
    expect(payingMembersOn(memberships, "2026-10-31")).toBe(3);
  });

  it("adds up today's prices of counting memberships in kronor", () => {
    expect(monthlyRevenue(memberships, "2026-10-10")).toBe(1795);
  });
});

describe("the twelve-month trend", () => {
  it("ends with this month and starts eleven months back", () => {
    expect(rollingMonths("2026-01-15")).toEqual([
      "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07",
      "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01",
    ]);
  });

  it("counts each month at its last day, this month today, and months before Mana as 0", () => {
    const trend = memberTrend(
      [
        m({ manaUserId: "a" }),
        m({ manaUserId: "b", status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-10-02" }),
        m({ manaUserId: "c", name: "Performance (löpande)", startDate: "2026-10-03", priceAmount: 209500 }),
      ],
      "2026-10-10",
    );
    const all = trend.series[""];
    expect(all).toHaveLength(12);
    expect(all.slice(0, 8).every((p) => p.count === 0)).toBe(true);
    expect(all.at(-2)).toEqual({ month: "2026-09", asOf: "2026-09-30", count: 2 });
    expect(all.at(-1)).toEqual({ month: "2026-10", asOf: "2026-10-10", count: 2 });
    expect(trend.names).toEqual(["Basic", "Performance (löpande)"]);
    expect(trend.series["Performance (löpande)"].at(-1)?.count).toBe(1);
  });

  it("gives the change from last month, or nothing when last month was empty", () => {
    const point = (count: number) => ({ month: "", asOf: "", count });
    expect(monthOverMonth([point(200), point(210)])).toBeCloseTo(0.05);
    expect(monthOverMonth([point(0), point(210)])).toBeNull();
  });
});
