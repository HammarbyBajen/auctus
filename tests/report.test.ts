import { describe, expect, it } from "vitest";
import { buildLeadReport, lastMonths, type ReportLead } from "@/lib/reports/leads";

const allDays = { clockDays: [1, 2, 3, 4, 5, 6, 7], daysOff: [] as string[], firstContactHours: 24 };
const at = (iso: string) => new Date(iso);
const lead = (createdAt: string, extra: Partial<ReportLead> = {}): ReportLead => ({
  source: "contact_form",
  createdAt: at(createdAt),
  imported: false,
  wonAt: null,
  firstContactAt: null,
  ...extra,
});

describe("the lead report", () => {
  it("lists the last twelve months, oldest first", () => {
    expect(lastMonths("2026-10-15", 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(lastMonths("2026-01-02", 2)).toEqual(["2025-12", "2026-01"]);
  });

  it("counts leads per source and month, by Tegen's time", () => {
    const r = buildLeadReport(
      [
        lead("2026-10-01T08:00:00+02:00"),
        lead("2026-10-02T08:00:00+02:00", { source: "chat_bot" }),
        // 00:30 on 1 October in Stockholm is still 30 September in UTC.
        lead("2026-10-01T00:30:00+02:00", { source: "chat_bot" }),
        lead("2026-09-20T08:00:00+02:00", { source: "pipedrive", imported: true }),
        // Older than the twelve months: left out.
        lead("2025-09-30T08:00:00+02:00"),
      ],
      "2026-10-15",
      allDays,
    );
    const oct = r.months.at(-1)!;
    expect(oct).toMatchObject({ month: "2026-10", total: 3, bySource: { contact_form: 1, chat_bot: 2 } });
    expect(r.months.at(-2)).toMatchObject({ month: "2026-09", total: 1, own: 0 });
    expect(r.sources).toEqual(["chat_bot", "contact_form", "pipedrive"]);
    expect(r.months).toHaveLength(12);
  });

  it("counts conversion and contact time only for leads made in Tegen HQ", () => {
    const r = buildLeadReport(
      [
        // Contacted after 2 h, became a member.
        lead("2026-10-01T08:00:00+02:00", { firstContactAt: at("2026-10-01T10:00:00+02:00"), wonAt: at("2026-10-08T12:00:00+02:00") }),
        // Contacted after 30 h: past the 24 h limit.
        lead("2026-10-02T08:00:00+02:00", { firstContactAt: at("2026-10-03T14:00:00+02:00") }),
        // Contacted after 4 h.
        lead("2026-10-03T08:00:00+02:00", { firstContactAt: at("2026-10-03T12:00:00+02:00") }),
        // Nobody yet.
        lead("2026-10-10T08:00:00+02:00"),
        // Imported: in the counts, not in conversion or contact time.
        lead("2026-10-04T08:00:00+02:00", { imported: true, firstContactAt: at("2026-10-09T08:00:00+02:00") }),
      ],
      "2026-10-15",
      allDays,
    );
    expect(r.conversion).toEqual({ leads: 4, won: 1 });
    expect(r.months.at(-1)).toMatchObject({ total: 5, own: 4, won: 1 });
    // 2, 30 and 4 hours: average 12, median 4, two of three within 24 h.
    expect(r.contact).toEqual({ contacted: 3, waiting: 1, averageHours: 12, medianHours: 4, withinLimit: 2 / 3 });
  });

  it("follows the days the clock runs: a Friday lead answered on Monday morning is in time when weekends are off", () => {
    const weekdays = { clockDays: [1, 2, 3, 4, 5], daysOff: [], firstContactHours: 24 };
    const friday = lead("2026-10-09T16:00:00+02:00", { firstContactAt: at("2026-10-12T09:00:00+02:00") });
    expect(buildLeadReport([friday], "2026-10-15", weekdays).contact.withinLimit).toBe(1);
    expect(buildLeadReport([friday], "2026-10-15", allDays).contact.withinLimit).toBe(0);
  });

  it("has nothing to say about contact time before any lead is contacted", () => {
    const r = buildLeadReport([lead("2026-10-10T08:00:00+02:00")], "2026-10-15", allDays);
    expect(r.contact).toEqual({ contacted: 0, waiting: 1, averageHours: null, medianHours: null, withinLimit: null });
  });
});
