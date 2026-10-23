import { describe, expect, it } from "vitest";
import { earliestTrialDay, isTrialDay, trialFollowUpDay } from "@/lib/leads/trial";

const today = "2026-10-23";

describe("the trial date (ticket 33)", () => {
  it("takes a real date from two weeks back to three months ahead", () => {
    expect(isTrialDay("2026-10-23", today)).toBe(true);
    expect(isTrialDay("2026-10-09", today)).toBe(true);
    expect(isTrialDay("2026-10-08", today)).toBe(false);
    expect(isTrialDay("2027-01-21", today)).toBe(true);
    expect(isTrialDay("2027-01-22", today)).toBe(false);
    expect(isTrialDay("2026-02-30", today)).toBe(false);
    expect(isTrialDay("torsdag", today)).toBe(false);
  });

  it("follows up the day after the trial, or today when that day has passed", () => {
    expect(trialFollowUpDay("2026-10-30", today)).toBe("2026-10-31");
    expect(trialFollowUpDay("2026-10-31", today)).toBe("2026-11-01");
    expect(trialFollowUpDay("2026-10-22", today)).toBe("2026-10-23");
    expect(trialFollowUpDay("2026-10-15", today)).toBe("2026-10-23");
  });

  it("offers dates from two weeks back", () => {
    expect(earliestTrialDay(today)).toBe("2026-10-09");
  });
});
