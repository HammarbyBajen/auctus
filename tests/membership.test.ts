import { describe, expect, it } from "vitest";
import {
  autoWinMembership,
  countingMemberships,
  pickManaMatch,
  type MirroredMembership,
} from "@/lib/mana/membership";

function m(overrides: Partial<MirroredMembership>): MirroredMembership {
  return {
    id: "um",
    membershipId: "basic",
    name: "Basic",
    status: "active",
    startDate: "2026-10-10",
    cancelEffectiveDate: null,
    pendingChangeKind: null,
    pendingChangeDate: null,
    ...overrides,
  };
}

describe("countingMemberships", () => {
  it("counts active and upcoming memberships, not ended ones", () => {
    const list = [m({ id: "a", status: "active" }), m({ id: "f", status: "future" }), m({ id: "e", status: "ended" })];
    expect(countingMemberships(list, []).map((x) => x.id)).toEqual(["a", "f"]);
  });

  it("leaves out what the owners say is not a membership, like a locker", () => {
    const list = [m({ id: "gym" }), m({ id: "box", membershipId: "locker", name: "Förvaringsbox" })];
    expect(countingMemberships(list, ["locker"]).map((x) => x.id)).toEqual(["gym"]);
  });
});

describe("pickManaMatch", () => {
  const a = { manaUserId: "a" };
  const b = { manaUserId: "b" };
  it("prefers a single email match", () => {
    expect(pickManaMatch([a], [b])).toBe(a);
  });
  it("uses the phone when the email does not match anyone", () => {
    expect(pickManaMatch([], [b])).toBe(b);
  });
  it("refuses to guess when a phone is shared by several people", () => {
    expect(pickManaMatch([], [a, b])).toBeNull();
  });
  it("refuses to guess when an email is shared by several people", () => {
    expect(pickManaMatch([a, b], [a])).toBeNull();
  });
  it("finds nobody when nothing matches", () => {
    expect(pickManaMatch([], [])).toBeNull();
  });
});

describe("autoWinMembership", () => {
  const base = { stageKind: "open" as const, leadCreatedDay: "2026-10-09", alreadyAutoWon: false };

  it("wins a lead when a membership starts on or after the day the lead came in", () => {
    expect(autoWinMembership({ ...base, counting: [m({ startDate: "2026-10-09" })] })?.startDate).toBe("2026-10-09");
    expect(autoWinMembership({ ...base, counting: [m({ startDate: "2026-10-20" })] })).not.toBeNull();
  });

  it("does not win an existing member who got in touch", () => {
    expect(autoWinMembership({ ...base, counting: [m({ startDate: "2026-09-07" })] })).toBeNull();
  });

  it("wins a cold lead who joins after all", () => {
    expect(
      autoWinMembership({ ...base, stageKind: "cold", counting: [m({ startDate: "2026-11-01" })] }),
    ).not.toBeNull();
  });

  it("does nothing for a lead that is already won", () => {
    expect(autoWinMembership({ ...base, stageKind: "won", counting: [m({})] })).toBeNull();
  });

  it("happens only once: not again after an owner moved it back", () => {
    expect(autoWinMembership({ ...base, alreadyAutoWon: true, counting: [m({})] })).toBeNull();
  });

  it("does nothing without a counting membership", () => {
    expect(autoWinMembership({ ...base, counting: [] })).toBeNull();
  });

  it("names the earliest qualifying membership", () => {
    const won = autoWinMembership({
      ...base,
      counting: [m({ id: "later", startDate: "2026-11-01" }), m({ id: "first", startDate: "2026-10-12" })],
    });
    expect(won?.id).toBe("first");
  });
});
