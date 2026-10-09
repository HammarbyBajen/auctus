import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizePhone } from "@/lib/leads/matching";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Fredrik@Example.SE ")).toBe("fredrik@example.se");
  });
  it("returns null for empty or missing", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("makes Swedish numbers written in different ways equal", () => {
    const forms = ["070-123 45 67", "0701234567", "+46 70 123 45 67", "0046701234567", "+46 (0)70 123 45 67"];
    for (const form of forms) expect(normalizePhone(form), form).toBe("0701234567");
  });
  it("keeps other international numbers with their prefix", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
  });
  it("returns null when it is not a real number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
