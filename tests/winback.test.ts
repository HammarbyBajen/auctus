import { describe, expect, it } from "vitest";
import type { MirroredMembership } from "@/lib/mana/membership";
import { endDayOf, isDayPassProspect, membershipSignals } from "@/lib/mana/winback";

const today = "2026-10-09";
let n = 0;
function m(overrides: Partial<MirroredMembership>): MirroredMembership {
  n += 1;
  return {
    id: `um-${n}`,
    membershipId: "basic",
    name: "Basic",
    status: "active",
    startDate: "2026-09-07",
    cancelEffectiveDate: "2026-11-30", // only the notice date, never an end date
    pendingChangeKind: null,
    pendingChangeDate: null,
    ...overrides,
  };
}

describe("endDayOf", () => {
  it("takes the end day from the scheduled cancellation, not from cancelEffectiveDate", () => {
    expect(endDayOf(m({ pendingChangeKind: "cancel", pendingChangeDate: "2026-11-30", cancelEffectiveDate: null }))).toBe("2026-11-30");
    expect(endDayOf(m({}))).toBeNull();
  });
});

describe("membershipSignals", () => {
  it("does nothing for an ordinary active member", () => {
    expect(membershipSignals([m({})], [], today)).toEqual([]);
  });

  it("finds a scheduled cancellation, with its last day", () => {
    const [signal] = membershipSignals([m({ pendingChangeKind: "cancel", pendingChangeDate: "2026-11-30" })], [], today);
    expect(signal).toMatchObject({ kind: "cancelled", date: "2026-11-30" });
  });

  it("does not treat a switch between plans as someone leaving", () => {
    const cancelling = m({ pendingChangeKind: "cancel", pendingChangeDate: "2026-10-31" });
    const next = m({ status: "future", startDate: "2026-11-01", name: "Basic (12mån)" });
    expect(membershipSignals([cancelling, next], [], today)).toEqual([]);
  });

  it("does not count a locker that is ignored as carrying on", () => {
    const cancelling = m({ pendingChangeKind: "cancel", pendingChangeDate: "2026-10-31" });
    const locker = m({ membershipId: "locker", name: "Förvaringsbox" });
    expect(membershipSignals([cancelling, locker], ["locker"], today).map((s) => s.kind)).toEqual(["cancelled"]);
    // With the locker counting as a membership, the person keeps something and is not leaving.
    expect(membershipSignals([cancelling, locker], [], today)).toEqual([]);
  });

  it("finds a scheduled freeze even when the person has other memberships", () => {
    const freezing = m({ pendingChangeKind: "freeze", pendingChangeDate: "2026-10-20" });
    const signals = membershipSignals([freezing, m({ membershipId: "locker" })], [], today);
    expect(signals).toEqual([{ kind: "freeze", membership: freezing, date: "2026-10-20" }]);
  });

  it("finds a membership that ended in the last 30 days, and not older ones", () => {
    const recent = m({ status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-09-30", cancelEffectiveDate: null });
    const old = m({ status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-08-31", cancelEffectiveDate: null });
    expect(membershipSignals([recent], [], today).map((s) => s.kind)).toEqual(["ended"]);
    expect(membershipSignals([old], [], today)).toEqual([]);
  });

  it("does not flag an ended membership when the person has a new one", () => {
    const ended = m({ status: "ended", pendingChangeKind: "cancel", pendingChangeDate: "2026-10-01" });
    expect(membershipSignals([ended, m({ startDate: "2026-10-02" })], [], today)).toEqual([]);
  });

  it("ignores memberships the owners do not count", () => {
    const locker = m({ membershipId: "locker", pendingChangeKind: "cancel", pendingChangeDate: "2026-10-31" });
    expect(membershipSignals([locker], ["locker"], today)).toEqual([]);
  });
});

describe("isDayPassProspect", () => {
  it("is a recent buyer with no membership", () => {
    expect(isDayPassProspect([], [], "2026-10-01", today)).toBe(true);
  });
  it("is not someone who already has a membership, or an upcoming one", () => {
    expect(isDayPassProspect([m({})], [], "2026-10-01", today)).toBe(false);
    expect(isDayPassProspect([m({ status: "future" })], [], "2026-10-01", today)).toBe(false);
  });
  it("is still a prospect when their only membership has ended", () => {
    expect(isDayPassProspect([m({ status: "ended" })], [], "2026-10-01", today)).toBe(true);
  });
  it("is not a buyer from more than 30 days ago", () => {
    expect(isDayPassProspect([], [], "2026-09-01", today)).toBe(false);
    expect(isDayPassProspect([], [], null, today)).toBe(false);
  });
});
