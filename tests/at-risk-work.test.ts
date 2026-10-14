import { describe, expect, it } from "vitest";
import { distribute, firstName, groupOf, mailtoFor } from "@/lib/mana/at-risk-work";

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
    const link = mailtoFor({ email: "asa@example.test", name: "Åsa Öberg", lastVisitAt: null }, emails);
    const url = new URL(link);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("asa@example.test");
    expect(url.searchParams.get("subject")).toBe("Hej Åsa!");
    expect(url.searchParams.get("body")).toBe("Hej Åsa,\r\nvi har inte sett dig i Mana än.\r\nHälsningar Tegen");
    expect(new URL(mailtoFor({ email: "b@example.test", name: "Bo Ek", lastVisitAt: new Date() }, emails)).searchParams.get("body")).toBe("Hej Bo Ek");
  });

  it("only fills in the address while Tegen has written no template", () => {
    expect(mailtoFor({ email: "asa@example.test", name: "Åsa", lastVisitAt: null }, null)).toBe("mailto:asa@example.test");
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
