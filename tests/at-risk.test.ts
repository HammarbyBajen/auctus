import { describe, expect, it } from "vitest";
import { atRiskMembers, isNewMember } from "@/lib/mana/at-risk";
import type { KpiMembership } from "@/lib/kpi/members";

const m = (over: Partial<KpiMembership>): KpiMembership => ({
  manaUserId: "u",
  name: "Basic",
  status: "active",
  startDate: "2026-09-01",
  pendingChangeKind: null,
  pendingChangeDate: null,
  commitmentEndDate: null,
  cancelEffectiveDate: null,
  priceAmount: 169500,
  ...over,
});
const at = (day: string) => new Date(`${day}T17:00:00Z`);
const today = "2026-10-31";

describe("atRiskMembers", () => {
  it("flags a paying member whose last visit is 30 or more days ago, longest away first", () => {
    const result = atRiskMembers(
      [m({ manaUserId: "away" }), m({ manaUserId: "longer" }), m({ manaUserId: "regular" }), m({ manaUserId: "edge" })],
      new Map([
        ["away", at("2026-09-30")],
        ["longer", at("2026-09-15")],
        ["regular", at("2026-10-29")],
        ["edge", at("2026-10-02")],
      ]),
      today,
      30,
    );
    expect(result.map((r) => [r.manaUserId, r.daysAway])).toEqual([
      ["longer", 46],
      ["away", 31],
    ]);
  });

  it("counts from the start of paying when there has never been a visit", () => {
    const result = atRiskMembers([m({ manaUserId: "never" }), m({ manaUserId: "new", startDate: "2026-10-25" })], new Map(), today, 30);
    expect(result).toEqual([{ manaUserId: "never", lastVisitAt: null, daysAway: 60, isNew: false }]);
  });

  it("flags a new member after 10 days without a visit, counted from their start (ticket 34)", () => {
    const result = atRiskMembers(
      [
        m({ manaUserId: "moved" }),
        m({ manaUserId: "no-show", startDate: "2026-10-21" }),
        m({ manaUserId: "too-soon", startDate: "2026-10-22" }),
        m({ manaUserId: "stopped", startDate: "2026-10-01" }),
        m({ manaUserId: "coming", startDate: "2026-10-01" }),
      ],
      new Map([
        ["moved", at("2026-10-25")],
        ["stopped", at("2026-10-20")],
        ["coming", at("2026-10-28")],
      ]),
      today,
      30,
    );
    expect(result).toEqual([
      { manaUserId: "stopped", lastVisitAt: at("2026-10-20"), daysAway: 11, isNew: true },
      { manaUserId: "no-show", lastVisitAt: null, daysAway: 10, isNew: true },
    ]);
  });

  it("does not treat memberships moved in on the first day, or older than 8 weeks, as new", () => {
    expect(isNewMember("2026-09-01", "2026-09-01", today)).toBe(false);
    expect(isNewMember("2026-09-05", "2026-09-01", today)).toBe(false);
    expect(isNewMember("2026-09-06", "2026-09-01", today)).toBe(true);
    // A member whose first membership is old, on a new plan, is not new.
    const result = atRiskMembers(
      [m({ manaUserId: "old", status: "ended", startDate: "2026-09-01" }), m({ manaUserId: "old", startDate: "2026-10-15" }), m({ manaUserId: "x", startDate: "2026-08-01" })],
      new Map([
        ["old", at("2026-10-16")],
        ["x", at("2026-10-30")],
      ]),
      today,
      30,
    );
    expect(result).toEqual([]);
  });

  it("never flags someone on a freeze, someone who stopped paying, or a free membership", () => {
    const result = atRiskMembers(
      [
        m({ manaUserId: "frozen", pendingChangeKind: "freeze", pendingChangeDate: "2026-10-15" }),
        m({ manaUserId: "gone", status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-10-20" }),
        m({ manaUserId: "coach", name: "Fri träning", priceAmount: 0 }),
      ],
      new Map(),
      today,
      30,
    );
    expect(result).toEqual([]);
  });

  it("follows the threshold the owners set", () => {
    const visits = new Map([["u", at("2026-10-15")]]);
    expect(atRiskMembers([m({})], visits, today, 30)).toEqual([]);
    expect(atRiskMembers([m({})], visits, today, 14)).toHaveLength(1);
  });
});
