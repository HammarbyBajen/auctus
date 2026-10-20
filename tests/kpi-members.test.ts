import { describe, expect, it } from "vitest";
import { countsOn, frozenOn, memberTrend, priceOn, monthlyRevenue, monthOverMonth, movementThisMonth, payingMembersOn, rollingMonths, snapshotOn, type KpiMembership } from "@/lib/kpi/members";

const m = (over: Partial<KpiMembership>): KpiMembership => ({
  manaUserId: "u1",
  name: "Basic",
  status: "active",
  startDate: "2026-09-23",
  pendingChangeKind: null,
  pendingChangeDate: null,
  commitmentEndDate: null,
  cancelEffectiveDate: null,
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

  it("ends a membership that simply ran out on its commitment end, else the day notice was given", () => {
    const ranOut = m({ name: "Basic (12mån)", status: "ended", commitmentEndDate: "2027-03-31" });
    expect(countsOn(ranOut, "2026-12-01")).toBe(true);
    expect(countsOn(ranOut, "2027-03-31")).toBe(true);
    expect(countsOn(ranOut, "2027-04-01")).toBe(false);
    const noticed = m({ status: "ended", cancelEffectiveDate: "2026-10-15" });
    expect(countsOn(noticed, "2026-10-15")).toBe(true);
    expect(countsOn(noticed, "2026-10-16")).toBe(false);
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

describe("snapshots", () => {
  const memberships = [
    m({ manaUserId: "a" }),
    m({ manaUserId: "a", name: "Förvaringsbox", priceAmount: 5000 }),
    m({ manaUserId: "b", name: "Förvaringsbox", priceAmount: 5000 }),
    m({ manaUserId: "c", name: "Fri träning", priceAmount: 0 }),
  ];

  it("saves paying members, revenue in öre and members per membership", () => {
    expect(snapshotOn(memberships, "2026-10-10")).toEqual({
      day: "2026-10-10",
      payingMembers: 2,
      revenue: 179500,
      byName: { Basic: 1, Förvaringsbox: 2 },
    });
  });

  it("uses a past month's last snapshot over the rebuilt count, and keeps this month live", () => {
    const snapshots = [
      { day: "2026-09-29", payingMembers: 50, revenue: 0, byName: { Basic: 40 } },
      { day: "2026-09-30", payingMembers: 60, revenue: 0, byName: { Basic: 45 } },
      { day: "2026-10-09", payingMembers: 99, revenue: 0, byName: { Basic: 99 } },
    ];
    const trend = memberTrend(memberships, "2026-10-10", snapshots);
    expect(trend.series[""].at(-2)).toEqual({ month: "2026-09", asOf: "2026-09-30", count: 60 });
    expect(trend.series.Basic.at(-2)?.count).toBe(45);
    expect(trend.series["Förvaringsbox"].at(-2)?.count).toBe(0);
    expect(trend.series[""].at(-1)).toEqual({ month: "2026-10", asOf: "2026-10-10", count: 2 });
    // A month without a snapshot is rebuilt from the memberships.
    expect(trend.series[""].at(-3)).toMatchObject({ month: "2026-08", count: 0 });
  });
});

describe("new and lost this month", () => {
  const memberships = [
    m({ manaUserId: "stays" }),
    m({ manaUserId: "joined", startDate: "2026-10-03" }),
    m({ manaUserId: "left", status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-10-05" }),
    m({ manaUserId: "froze", pendingChangeKind: "freeze", pendingChangeDate: "2026-10-08" }),
    m({ manaUserId: "switched", status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-09-30" }),
    m({ manaUserId: "switched", name: "Performance (löpande)", startDate: "2026-10-01", priceAmount: 209500 }),
  ];

  it("compares today with the end of last month; a started freeze counts as stopped; switching plans is neither", () => {
    expect(movementThisMonth(memberships, "2026-10-10")).toEqual({ joined: 1, left: 2 });
  });

  it("with a membership, counts who started or stopped holding that one", () => {
    expect(movementThisMonth(memberships, "2026-10-10", "Basic")).toEqual({ joined: 1, left: 3 });
    expect(movementThisMonth(memberships, "2026-10-10", "Performance (löpande)")).toEqual({ joined: 1, left: 0 });
  });

  it("is part of the trend, for everyone and per membership", () => {
    const trend = memberTrend(memberships, "2026-10-10");
    expect(trend.movement[""]).toEqual({ joined: 1, left: 2 });
    expect(trend.movement.Basic).toEqual({ joined: 1, left: 3 });
  });
});

describe("price periods (ticket 26)", () => {
  const period = (over: Partial<NonNullable<KpiMembership["pricePeriods"]>[number]>) => ({
    fromDate: "2026-10-01",
    toDate: "2026-10-31",
    amount: 169500,
    type: "base",
    discountPercent: null,
    disabled: false,
    ...over,
  });

  it("does not count a membership while a freeze period covers the day, even with no freeze still to come", () => {
    const frozen = m({ pricePeriods: [period({ fromDate: "2026-10-10", toDate: "2027-01-31", amount: 0, type: "unknown", disabled: true })] });
    expect(countsOn(frozen, "2026-10-09")).toBe(true);
    expect(frozenOn(frozen, "2026-10-15")).toBe(true);
    expect(countsOn(frozen, "2026-10-15")).toBe(false);
    expect(countsOn(frozen, "2027-02-01")).toBe(true);
    expect(payingMembersOn([frozen], "2026-10-15")).toBe(0);
    expect(snapshotOn([frozen], "2026-10-15").revenue).toBe(0);
  });

  it("counts a discount at the discounted price, and a member with 100 % off still as a member", () => {
    const free = m({ pricePeriods: [period({ amount: 0, type: "percent_discount", discountPercent: 100 })] });
    expect(countsOn(free, "2026-10-15")).toBe(true);
    expect(priceOn(free, "2026-10-15")).toBe(0);
    expect(priceOn(free, "2026-11-01")).toBe(169500);
    const half = m({ pricePeriods: [period({ amount: null, type: "percent_discount", discountPercent: 50 })] });
    expect(priceOn(half, "2026-10-15")).toBe(84750);
  });

  it("uses another price for its period", () => {
    const changed = m({ pricePeriods: [period({ fromDate: "2026-10-01", toDate: null, amount: 149500, type: "unknown" })] });
    expect(priceOn(changed, "2026-12-01")).toBe(149500);
    expect(monthlyRevenue([changed], "2026-12-01")).toBe(1495);
  });

  it("takes a period at 0 kr as 0 kr: nobody pays in advance (decided 2026-10-20)", () => {
    const free = m({ pricePeriods: [period({ fromDate: "2026-09-23", toDate: "2026-10-31", amount: 0, type: "unknown" })] });
    // Still a member: payments start when the period ends.
    expect(countsOn(free, "2026-10-15")).toBe(true);
    expect(priceOn(free, "2026-10-15")).toBe(0);
    expect(priceOn(free, "2026-11-01")).toBe(169500);
  });

  it("does not count a membership that is 0 kr with no end as a paying one", () => {
    const forGood = m({ pricePeriods: [period({ fromDate: "2026-09-23", toDate: null, amount: 0, type: "unknown" })] });
    expect(countsOn(forGood, "2026-10-15")).toBe(false);
    expect(payingMembersOn([forGood], "2026-10-15")).toBe(0);
    expect(monthlyRevenue([forGood], "2026-10-15")).toBe(0);
    // A 100 % discount with no end is still a member, as before.
    const discounted = m({ pricePeriods: [period({ toDate: null, amount: 0, type: "percent_discount", discountPercent: 100 })] });
    expect(countsOn(discounted, "2026-10-15")).toBe(true);
  });

  it("uses the ordinary price when a period gives no amount", () => {
    const unpriced = m({ pricePeriods: [period({ amount: null, type: "unknown" })] });
    expect(priceOn(unpriced, "2026-10-15")).toBe(169500);
  });

  it("lets a discount win over the period it sits in", () => {
    const both = m({
      pricePeriods: [period({ fromDate: "2026-09-23", toDate: "2026-12-31", amount: 169500 }), period({ amount: 0, type: "percent_discount", discountPercent: 100 })],
    });
    expect(priceOn(both, "2026-10-15")).toBe(0);
    expect(priceOn(both, "2026-11-15")).toBe(169500);
  });
});
