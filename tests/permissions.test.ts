import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("fixed roles", () => {
  it("lets an owner manage settings and users and see salary hours", () => {
    expect(can("owner", "settings", "manage")).toBe(true);
    expect(can("owner", "users", "manage")).toBe(true);
    expect(can("owner", "salary", "read")).toBe(true);
    expect(can("owner", "kpi", "read")).toBe(true);
  });

  it("lets staff work with leads but not open settings, users or salary", () => {
    expect(can("staff", "leads", "write")).toBe(true);
    expect(can("staff", "settings", "manage")).toBe(false);
    expect(can("staff", "users", "manage")).toBe(false);
    expect(can("staff", "salary", "read")).toBe(false);
    expect(can("staff", "kpi", "read")).toBe(false);
  });

  it("denies everything for a missing or unknown role", () => {
    expect(can(null, "leads", "read")).toBe(false);
    expect(can(undefined, "leads", "read")).toBe(false);
    expect(can("admin", "settings", "manage")).toBe(false);
  });
});
