import { describe, expect, it } from "vitest";
import { balanceOf, klippkortNudge, purchaseDescription, watchedBundles } from "@/lib/mana/klippkort";

const bundles = [
  { id: "klipp", name: "Klippkort", credits: 10 },
  { id: "day", name: "Tegen Day Pass", credits: 1 },
  { id: "pt30", name: "Personlig Träning 1x 30min", credits: 1 },
];

describe("watchedBundles", () => {
  it("watches cards with several classes until owners pick, not a day pass or one PT session", () => {
    expect(watchedBundles(bundles, null).map((b) => b.id)).toEqual(["klipp"]);
  });
  it("watches exactly what owners picked, and nothing when they picked nothing", () => {
    expect(watchedBundles(bundles, ["day", "pt30"]).map((b) => b.id)).toEqual(["day", "pt30"]);
    expect(watchedBundles(bundles, [])).toEqual([]);
  });
});

describe("purchaseDescription", () => {
  it("is how Mana names a bundle on a payment", () => {
    expect(purchaseDescription({ name: "Klippkort" })).toBe("Credit bundle: Klippkort");
  });
});

describe("balanceOf", () => {
  it("counts the person's own cards, not credits that come with a membership", () => {
    expect(
      balanceOf([
        { credits: 5, type: "default", expireDate: "2027-09-26" },
        { credits: 8, type: "membership_credits", expireDate: "2026-11-01" },
      ]),
    ).toEqual({ credits: 5, expireDate: "2027-09-26" });
  });
  it("adds up pools and takes the soonest expiry among those with classes left", () => {
    expect(
      balanceOf([
        { credits: 0, type: "default", expireDate: "2026-10-01" },
        { credits: 3, type: "default", expireDate: "2027-03-01" },
        { credits: 2, type: "default", expireDate: "2026-12-24" },
      ]),
    ).toEqual({ credits: 5, expireDate: "2026-12-24" });
  });
  it("is nothing left when Mana has no pools", () => {
    expect(balanceOf([])).toEqual({ credits: 0, expireDate: null });
  });
});

describe("klippkortNudge", () => {
  const today = "2026-10-21";
  it("nudges at 2 classes left, and when the card is used up", () => {
    expect(klippkortNudge({ credits: 2, expireDate: "2027-09-26" }, today)).toEqual({ kind: "few_left", credits: 2 });
    expect(klippkortNudge({ credits: 0, expireDate: null }, today)).toEqual({ kind: "few_left", credits: 0 });
  });
  it("does not nudge with 3 or more left and a year to go", () => {
    expect(klippkortNudge({ credits: 3, expireDate: "2027-09-26" }, today)).toBeNull();
  });
  it("nudges when a card with classes left expires within 14 days, not later", () => {
    expect(klippkortNudge({ credits: 6, expireDate: "2026-11-04" }, today)).toEqual({ kind: "expiring", credits: 6, expireDate: "2026-11-04" });
    expect(klippkortNudge({ credits: 6, expireDate: "2026-11-05" }, today)).toBeNull();
  });
});
