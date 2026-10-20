import { describe, expect, it } from "vitest";
import { firstNameOnly, mentionsHealth, notesForAi, withoutContactDetails } from "@/lib/ai/privacy";

describe("what may be sent to an AI (ticket 30)", () => {
  it("sees signs of health information in everyday Swedish notes", () => {
    for (const note of [
      "Har ont i knät, hör av sig om två veckor",
      "Skadade axeln i somras",
      "Opererad i våras, rehab klar i december",
      "Gravid, vill pausa till efter förlossningen",
      "Sjukskriven för utmattning",
      "Var hos naprapaten, får inte lyfta tungt",
      "Bröt handleden, fraktur",
    ]) expect(mentionsHealth(note), note).toBe(true);
  });

  it("does not flag ordinary training and sales notes", () => {
    for (const note of [
      "Ringde, vill testa på torsdag",
      "Vill träna axelpress och knäböj",
      "Frågade om pris för studentmedlemskap",
      "Inget svar, mejlade istället",
      "Kontakten gick bra, bokad provträning",
    ]) expect(mentionsHealth(note), note).toBe(false);
  });

  it("matches short terms as whole words only", () => {
    expect(mentionsHealth("ont i ryggen")).toBe(true);
    expect(mentionsHealth("Ontario-resan blev av")).toBe(false);
  });

  it("takes the studio's own words too", () => {
    expect(mentionsHealth("Har PCOS")).toBe(false);
    expect(mentionsHealth("Har PCOS", ["pcos"])).toBe(true);
  });

  it("holds back private and health notes whole, and cleans the rest", () => {
    const { sent, withheld } = notesForAi([
      { body: "Ringde, nås på 070-123 45 67 eller anna@example.com" },
      { body: "Ont i axeln, återkommer" },
      { body: "Privat sak", private: true },
      { body: "Vill börja i november" },
    ]);
    expect(withheld).toBe(2);
    expect(sent.map((n) => n.body)).toEqual(["Ringde, nås på [telefon] eller [e-post]", "Vill börja i november"]);
  });

  it("takes out phone numbers in their usual shapes and email addresses", () => {
    expect(withoutContactDetails("+46 70 123 45 67 / 0701234567 / 08-123 456 78 / a.b@c.se")).toBe("[telefon] / [telefon] / [telefon] / [e-post]");
    expect(withoutContactDetails("Nås på 070.123.45.67 eller (070) 123 45 67 eller +46 (0)70-123 45 67")).toBe("Nås på [telefon] eller [telefon] eller [telefon]");
    // Dates, times, short numbers and amounts stay.
    expect(withoutContactDetails("Kom 2026-11-03, 3 pass i veckan, helst 17.30-18.30, budget 1 500 kr")).toBe("Kom 2026-11-03, 3 pass i veckan, helst 17.30-18.30, budget 1 500 kr");
  });

  it("takes out personal identity numbers", () => {
    expect(withoutContactDetails("Pnr 19900101-1234 och 9001011234")).toBe("Pnr [personnummer] och [personnummer]");
  });

  it("keeps a web address but drops its tracking", () => {
    expect(withoutContactDetails("Sida: https://crossfittegen.se/prova?fbclid=IwAR3x&utm_source=fb#top")).toBe("Sida: https://crossfittegen.se/prova");
  });

  it("keeps the first name only", () => {
    expect(firstNameOnly("Anna Andersson")).toBe("Anna");
    expect(firstNameOnly(null)).toBe("");
  });
});
