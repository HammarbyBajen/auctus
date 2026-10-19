import { describe, expect, it } from "vitest";
import { isParkDay, parkDay } from "@/lib/leads/park";

describe("parking a lead (Vänta till)", () => {
  it("lands a week, two weeks or a month on", () => {
    expect(parkDay("2026-10-19", "1w")).toBe("2026-10-26");
    expect(parkDay("2026-10-19", "2w")).toBe("2026-11-02");
    expect(parkDay("2026-10-19", "1m")).toBe("2026-11-19");
  });

  it("crosses the year and keeps a month's last day", () => {
    expect(parkDay("2026-12-28", "1w")).toBe("2027-01-04");
    expect(parkDay("2026-01-31", "1m")).toBe("2026-02-28");
    expect(parkDay("2026-12-15", "1m")).toBe("2027-01-15");
  });

  it("only takes a real day after today", () => {
    expect(isParkDay("2026-10-20", "2026-10-19")).toBe(true);
    expect(isParkDay("2026-10-19", "2026-10-19")).toBe(false);
    expect(isParkDay("2026-02-30", "2026-01-01")).toBe(false);
    expect(isParkDay("", "2026-10-19")).toBe(false);
  });
});
