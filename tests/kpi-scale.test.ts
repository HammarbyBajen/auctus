import { describe, expect, it } from "vitest";
import { trendScale } from "@/lib/kpi/scale";

describe("trendScale", () => {
  it("starts the axis at least 5 % below the lowest month, on a round grid line", () => {
    const s = trendScale([200, 205, 210, 225, 234]);
    expect(s.bottom).toBeLessThanOrEqual(200 * 0.95);
    expect(s.bottom).toBeGreaterThan(0);
    expect(s.top).toBeGreaterThanOrEqual(234);
    expect(s).toMatchObject({ bottom: 180, top: 240, ticks: [180, 200, 220, 240], from: 0 });
  });

  it("leaves out the months before the first one with members", () => {
    const s = trendScale([0, 0, 0, 0, 0, 0, 0, 0, 0, 230, 234, 225]);
    expect(s.from).toBe(9);
    expect(s.bottom).toBeGreaterThan(0);
    expect(s.bottom).toBeLessThanOrEqual(225 * 0.95);
  });

  it("keeps 0 when a month after the first really had no members", () => {
    expect(trendScale([3, 0, 2]).bottom).toBe(0);
  });

  it("gives a flat line room above and below", () => {
    expect(trendScale([225, 225, 225])).toMatchObject({ bottom: 210, top: 230 });
    expect(trendScale([10, 10])).toMatchObject({ bottom: 9, top: 11, ticks: [9, 10, 11] });
  });

  it("uses whole-number grid lines for small memberships", () => {
    const s = trendScale([8, 9, 10]);
    expect(s.ticks.every(Number.isInteger)).toBe(true);
    expect(s.bottom).toBeLessThanOrEqual(8 * 0.95);
  });

  it("falls back to 0 to 1 when there are no members at all", () => {
    expect(trendScale([0, 0, 0])).toMatchObject({ bottom: 0, top: 1, ticks: [0, 1], from: 2 });
  });
});
