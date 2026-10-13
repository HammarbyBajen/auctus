import { describe, expect, it } from "vitest";
import { atRiskMembers } from "@/lib/mana/at-risk";
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

  it("counts from the start of paying when there has never been a visit, so new members get their first 30 days", () => {
    const result = atRiskMembers([m({ manaUserId: "never" }), m({ manaUserId: "new", startDate: "2026-10-20" })], new Map(), today, 30);
    expect(result).toEqual([{ manaUserId: "never", lastVisitAt: null, daysAway: 60 }]);
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
