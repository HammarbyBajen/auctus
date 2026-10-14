import { startOfDayInStockholm } from "@/lib/home/time";
import { todayInStockholm } from "@/lib/tasks/dates";

/**
 * The hours calculation (tickets 20-23), kept pure so every rule is tested on
 * its own. Names and hours only, never money.
 *
 * Rules (decided by Max, 2026-10-14):
 * - Hours are real minutes, end minus start, per coach (Mana's instructor)
 *   and category (a class, a specialist service or a course in Mana).
 * - Group classes and course sessions always count; a PT booking only when
 *   completed.
 * - Every category counts until an owner leaves it out. A left-out category
 *   is still shown, but not in the totals or the export.
 */

export type WorkSource = "class" | "service" | "course";

export type Work = {
  id: string;
  source: WorkSource;
  typeKey: string;
  typeLabel: string;
  instructorId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string | null;
};

export type Coach = { id: string; name: string };
export type Category = { typeKey: string; label: string; source: string; counted: boolean };

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first and last day of a month (YYYY-MM). */
export function monthDays(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/** What to pull for a month (Tegen's time), split into windows of at most a week to stay well inside Mana's limits. */
export function pullWindow(month: string): { from: Date; to: Date; weeks: { from: Date; to: Date }[] } {
  const { first, last } = monthDays(month);
  const end = addDays(last, 1);
  const weeks: { from: Date; to: Date }[] = [];
  for (let day = first; day < end; day = addDays(day, 7)) {
    const next = addDays(day, 7) < end ? addDays(day, 7) : end;
    weeks.push({ from: startOfDayInStockholm(day), to: startOfDayInStockholm(next) });
  }
  return { from: startOfDayInStockholm(first), to: startOfDayInStockholm(end), weeks };
}

export const minutesOf = (w: Pick<Work, "startsAt" | "endsAt">) => Math.max(0, Math.round((w.endsAt.getTime() - w.startsAt.getTime()) / 60_000));

/** Whether a piece of work was done: group classes and courses always, PT only when completed. */
export const counts = (w: Pick<Work, "source" | "status">) => w.source !== "service" || w.status === "completed";

const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export type CoachResult = {
  coachId: string;
  name: string;
  /** Hours per category in the month, counted or not. */
  byType: Record<string, number>;
  /** Hours in the categories that are counted. */
  total: number;
};

export type MonthResult = {
  month: string;
  coaches: CoachResult[];
  /** The categories that occur in the month, with whether they are counted. */
  types: Category[];
  /** Work in the month with no instructor in Mana. */
  unassigned: { id: string; typeLabel: string; startsAt: string; minutes: number }[];
  /** PT bookings in the month that were not done (booked, canceled, refunded, no-show), by status. */
  notCounted: Record<string, number>;
};

export function calculateMonth(input: { month: string; work: Work[]; coaches: Coach[]; categories: Category[] }): MonthResult {
  const { month } = input;
  const inMonth = input.work.filter((w) => todayInStockholm(w.startsAt).slice(0, 7) === month);
  const category = new Map(input.categories.map((c) => [c.typeKey, c]));
  const isCounted = (typeKey: string) => category.get(typeKey)?.counted !== false;

  const notCounted: Record<string, number> = {};
  for (const w of inMonth) {
    if (!counts(w)) notCounted[w.status ?? "okänd"] = (notCounted[w.status ?? "okänd"] ?? 0) + 1;
  }
  const done = inMonth.filter(counts);

  const types = new Map<string, Category>();
  for (const w of done) types.set(w.typeKey, category.get(w.typeKey) ?? { typeKey: w.typeKey, label: w.typeLabel, source: w.source, counted: true });

  const unassigned = done
    .filter((w) => !w.instructorId)
    .map((w) => ({ id: w.id, typeLabel: w.typeLabel, startsAt: w.startsAt.toISOString(), minutes: minutesOf(w) }));

  // Every instructor with work is a coach; one Mana no longer lists keeps their hours under their id.
  const names = new Map(input.coaches.map((c) => [c.id, c.name]));
  const minutes = new Map<string, Record<string, number>>();
  for (const w of done) {
    if (!w.instructorId) continue;
    const own = minutes.get(w.instructorId) ?? {};
    own[w.typeKey] = (own[w.typeKey] ?? 0) + minutesOf(w);
    minutes.set(w.instructorId, own);
  }
  const coaches: CoachResult[] = [...minutes].map(([id, byType]) => ({
    coachId: id,
    name: names.get(id) ?? `Okänd instruktör (${id.slice(0, 8)})`,
    byType: Object.fromEntries(Object.entries(byType).map(([k, m]) => [k, hours(m)])),
    total: hours(Object.entries(byType).reduce((n, [k, m]) => (isCounted(k) ? n + m : n), 0)),
  }));

  return {
    month,
    coaches: coaches.sort((a, b) => a.name.localeCompare(b.name, "sv")),
    types: [...types.values()].sort((a, b) => a.label.localeCompare(b.label, "sv")),
    unassigned,
    notCounted,
  };
}

/** The months to choose between: from Tegen's first month on Mana up to this one, newest first. */
export function monthOptions(today: string, first = "2026-09"): string[] {
  const months: string[] = [];
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  for (;;) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    if (month < first) break;
    months.push(month);
    if (--m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}

/** The month hours are usually counted for: the one before today's. */
export function previousMonth(today: string): string {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
