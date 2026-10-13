import { describe, expect, it } from "vitest";
import { intakePayloadSchema, isTestLead, parseAttribution } from "@/lib/intake/contract";

const valid = { id: "lead-1", route: "contact", name: "Anna", email: "anna@example.test" };

describe("intake contract", () => {
  it("accepts the minimum, extra fields included, and needs email or phone", () => {
    expect(intakePayloadSchema.safeParse(valid).success).toBe(true);
    expect(intakePayloadSchema.safeParse({ ...valid, somethingNew: 1, answers: { goal: "Styrka" } }).success).toBe(true);
    expect(intakePayloadSchema.safeParse({ ...valid, email: null, phone: "070-123 45 67" }).success).toBe(true);
    expect(intakePayloadSchema.safeParse({ ...valid, email: "" }).success).toBe(false);
    expect(intakePayloadSchema.safeParse({ ...valid, route: "fax" }).success).toBe(false);
    expect(intakePayloadSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
    expect(intakePayloadSchema.safeParse({ ...valid, submittedAt: "igår" }).success).toBe(false);
  });

  it("spots LAB37's test markers anywhere in the lead", () => {
    expect(isTestLead({ name: "Anna", email: "testlead@example.test", phone: null, message: null })).toBe(true);
    expect(isTestLead({ name: "Ignorer detta", email: null, phone: "070", message: null })).toBe(true);
    expect(isTestLead({ name: "Anna", email: null, phone: null, message: "hej från test-lab37" })).toBe(true);
    expect(isTestLead({ name: "Anna Testsson", email: "anna@example.test", phone: null, message: null })).toBe(false);
  });
});

describe("parseAttribution", () => {
  it("splits UTM, campaign and click ids, keeping click ids whole", () => {
    const gclid = "Cj0KCQjw-very-long_click.id~1234567890abcdefABCDEF";
    expect(parseAttribution(`facebook / paid · kampanj: Höst 2026 · fbclid: IwAR3x · gclid: ${gclid}`)).toEqual({
      utmSource: "facebook",
      utmMedium: "paid",
      campaign: "Höst 2026",
      clickIds: { fbclid: "IwAR3x", gclid },
    });
  });

  it("reads a referring site and direct visits, and nothing for nothing", () => {
    expect(parseAttribution("ref: google.se")).toEqual({ ref: "google.se" });
    expect(parseAttribution("Direkt / okänd")).toEqual({ direct: true });
    expect(parseAttribution(null)).toBeNull();
  });
});
