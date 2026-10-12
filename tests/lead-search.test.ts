import { describe, expect, it } from "vitest";
import { filtersToSearch, isFiltering, parseLeadFilters, phoneNeedle } from "@/lib/leads/search";

describe("parseLeadFilters", () => {
  it("reads the address, maps the Swedish values and ignores unknown periods", () => {
    expect(parseLeadFilters({ q: " anna ", fas: "cold", kalla: "chat_bot", ansvarig: "mina", period: "30" })).toEqual({
      q: "anna",
      stage: "cold",
      source: "chat_bot",
      assignee: "mine",
      period: "30",
    });
    expect(parseLeadFilters({ ansvarig: "ingen", period: "12" })).toMatchObject({ assignee: "none", period: "" });
    expect(parseLeadFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  it("counts as filtering only when something is set; the phone tab and cold view (steg) are not filters", () => {
    expect(isFiltering(parseLeadFilters({}))).toBe(false);
    expect(isFiltering(parseLeadFilters({ steg: "cold", q: "", kalla: "" }))).toBe(false);
    expect(isFiltering(parseLeadFilters({ q: "x" }))).toBe(true);
    expect(isFiltering(parseLeadFilters({ period: "7" }))).toBe(true);
  });

  it("writes filters back to an address, leaving out empty ones", () => {
    expect(filtersToSearch(parseLeadFilters({ q: "anna", ansvarig: "ingen" }))).toBe("?q=anna&ansvarig=ingen");
    expect(filtersToSearch(parseLeadFilters({}))).toBe("");
  });
});

describe("phoneNeedle", () => {
  it("looks for the digits however the number is written, and +46 in the national form", () => {
    expect(phoneNeedle("070-123 45 67")).toBe("0701234567");
    expect(phoneNeedle("+46 70 123 45 67")).toBe("0701234567");
    expect(phoneNeedle("1234567")).toBe("1234567");
    expect(phoneNeedle("anna")).toBeNull();
    expect(phoneNeedle("07")).toBeNull();
  });
});
