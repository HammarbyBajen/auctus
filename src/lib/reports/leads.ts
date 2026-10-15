import { addRunningHours, type Clock } from "@/lib/home/clock";
import { todayInStockholm } from "@/lib/tasks/dates";

/**
 * The lead report (ticket 16), kept pure so every number is tested on a hand
 * count. Three questions: how many leads came from where each month, how many
 * of them became members, and how fast someone got in touch.
 *
 * Leads imported from Pipedrive count toward leads per source (their history
 * is real), but not toward conversion or contact time: the import left out
 * the deals that were already won, and their history was written on the day
 * of the import.
 */

export type ReportLead = {
  source: string;
  createdAt: Date;
  imported: boolean;
  /** When it first reached a Won stage, if it has. */
  wonAt: Date | null;
  /** The first time a person got in touch: a logged call or email, or moving it out of the first stage. */
  firstContactAt: Date | null;
};

export type MonthRow = {
  month: string;
  bySource: Record<string, number>;
  total: number;
  /** Leads made in Tegen HQ that month (the base for conversion). */
  own: number;
  won: number;
};

export type LeadReport = {
  months: MonthRow[];
  /** Sources that occur, most leads first. */
  sources: string[];
  conversion: { leads: number; won: number };
  contact: {
    /** Leads made in Tegen HQ that someone has got in touch with. */
    contacted: number;
    /** Leads made in Tegen HQ still waiting for a first contact. */
    waiting: number;
    averageHours: number | null;
    medianHours: number | null;
    /** Of those contacted, the share reached within the first-contact limit (Tidsgränser). */
    withinLimit: number | null;
  };
};

/** The last `count` months up to and including today's, oldest first (YYYY-MM). */
export function lastMonths(today: string, count: number): string[] {
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    if (--m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildLeadReport(leads: ReportLead[], today: string, limits: Clock & { firstContactHours: number }, monthCount = 12): LeadReport {
  const months = lastMonths(today, monthCount);
  const rows = new Map<string, MonthRow>(months.map((month) => [month, { month, bySource: {}, total: 0, own: 0, won: 0 }]));
  const sourceTotals = new Map<string, number>();

  const own: ReportLead[] = [];
  for (const lead of leads) {
    const row = rows.get(todayInStockholm(lead.createdAt).slice(0, 7));
    if (!row) continue;
    row.bySource[lead.source] = (row.bySource[lead.source] ?? 0) + 1;
    row.total += 1;
    sourceTotals.set(lead.source, (sourceTotals.get(lead.source) ?? 0) + 1);
    if (lead.imported) continue;
    own.push(lead);
    row.own += 1;
    if (lead.wonAt) row.won += 1;
  }

  const contacted = own.filter((l) => l.firstContactAt);
  const hours = contacted.map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 3_600_000).sort((a, b) => a - b);
  const median = hours.length === 0 ? null : hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2;
  const inTime = contacted.filter((l) => {
    const deadline = addRunningHours(l.createdAt, limits.firstContactHours, limits);
    return !deadline || l.firstContactAt! <= deadline;
  }).length;

  return {
    months: [...rows.values()],
    sources: [...sourceTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s),
    conversion: { leads: own.length, won: own.filter((l) => l.wonAt).length },
    contact: {
      contacted: contacted.length,
      waiting: own.length - contacted.length,
      averageHours: hours.length ? round1(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
      medianHours: median === null ? null : round1(median),
      withinLimit: contacted.length ? inTime / contacted.length : null,
    },
  };
}
