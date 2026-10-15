import { describe, expect, it } from "vitest";
import { atRiskDraft, distribute, firstName, groupOf } from "@/lib/mana/at-risk-work";

const emails = {
  never: { subject: "Hej {förnamn}!", body: "Hej {förnamn},\nvi har inte sett dig i Mana än.\nHälsningar Tegen" },
  away: { subject: "Vi saknar dig", body: "Hej {namn}" },
};

describe("working the Hör av dig till list", () => {
  it("splits members into never seen and stopped coming", () => {
    expect(groupOf({ lastVisitAt: null })).toBe("never");
    expect(groupOf({ lastVisitAt: new Date() })).toBe("away");
  });

  it("takes the first name", () => {
    expect(firstName("  Åsa  Öberg ")).toBe("Åsa");
    expect(firstName(null)).toBe("");
  });

  it("fills in the template for the member's group", () => {
    expect(atRiskDraft({ name: "Åsa Öberg", lastVisitAt: null }, emails)).toEqual({ subject: "Hej Åsa!", body: "Hej Åsa,\nvi har inte sett dig i Mana än.\nHälsningar Tegen" });
    expect(atRiskDraft({ name: "Bo Ek", lastVisitAt: new Date() }, emails)).toEqual({ subject: "Vi saknar dig", body: "Hej Bo Ek" });
  });

  it("starts empty while Tegen has written no template", () => {
    expect(atRiskDraft({ name: "Åsa", lastVisitAt: null }, null)).toEqual({ subject: "", body: "" });
  });

  it("shares the list evenly, in order", () => {
    expect([...distribute(["a", "b", "c", "d", "e"], ["max", "erik"])]).toEqual([
      ["a", "max"],
      ["b", "erik"],
      ["c", "max"],
      ["d", "erik"],
      ["e", "max"],
    ]);
    expect(distribute(["a"], []).size).toBe(0);
  });
});
