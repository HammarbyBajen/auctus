import { describe, expect, it } from "vitest";
import { daysAgo, daysBetween, groupActivity } from "@/lib/leads/activity";
import type { HistoryItem } from "@/lib/leads/service";

const at = (s: number) => new Date(Date.UTC(2026, 9, 12, 10, 0, s));
const contact = (id: string, s: number, authorName = "Timmy"): HistoryItem => ({ kind: "contact_logged", id, at: at(s), authorName, outcome: "called" });
const note = (id: string, s: number, body: string, authorName = "Timmy"): HistoryItem => ({ kind: "note", id, at: at(s), authorName, body });

describe("groupActivity", () => {
  it("shows a call and the note saved with it as one entry", () => {
    expect(groupActivity([note("n1", 2, "Vill prova torsdag"), contact("c1", 1)])).toEqual([
      { ...contact("c1", 1), note: "Vill prova torsdag" },
    ]);
  });

  it("keeps notes apart that were written later, or by someone else", () => {
    const items = [note("n2", 40, "Senare"), note("n1", 3, "Annan person", "Fredrik"), contact("c1", 1)];
    expect(groupActivity(items).map((i) => `${i.kind}-${i.id}`)).toEqual(["note-n2", "note-n1", "contact_logged-c1"]);
  });

  it("gives each note to one contact only", () => {
    const grouped = groupActivity([contact("c2", 3), note("n1", 2, "En"), contact("c1", 1)]);
    expect(grouped).toHaveLength(2);
    expect(grouped.filter((i) => "note" in i)).toHaveLength(1);
  });
});

describe("daysAgo", () => {
  it("counts calendar days in Stockholm, not hours", () => {
    expect(daysBetween("2026-10-10", "2026-10-12")).toBe(2);
    expect(daysAgo(new Date("2026-10-11T22:30:00Z"), "2026-10-12")).toBe(0); // 00:30 on the 12th in Stockholm
    expect(daysAgo(new Date("2026-10-11T21:30:00Z"), "2026-10-12")).toBe(1);
  });
});
