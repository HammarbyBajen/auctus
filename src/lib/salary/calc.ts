import { startOfDayInStockholm } from "@/lib/home/time";
import { todayInStockholm } from "@/lib/tasks/dates";

/**
 * The Salary (WFM) calculation (tickets 20-22), kept pure so every rule is
 * tested on its own. Names and hours only, never money.
 *
 * Rules (decided by Max, 2026-10-14):
 * - Hours are real minutes, end minus start.
 * - Group classes and Kids course sessions always count; a PT or Onramp
 *   booking counts only when completed.
 * - A coach's free classes are whole group classes held unpaid in exchange
 *   for training for free: the first N group classes of each week (Monday to
 *   Sunday, Tegen's time), in time order, from the person's active-from day.
 *   Only paid group classes can be free ones, and never Tegenbutik.
 * - A week spanning two months is decided as one week, and each class is
 *   booked to the month it falls in.
 * - Work of a type nobody has decided on yet is shown and flagged, and not
 *   paid until it is.
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

export type Person = { id: string; name: string; manaInstructorId: string | null; freeClassesPerWeek: number; activeFrom: string | null };
export type Rule = { typeKey: string; label: string; source: string; paid: boolean | null };

const neverFree = /^tegenbutik$/i;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the week a day falls in (YYYY-MM-DD). */
export function mondayOf(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/** The first and last day of a month (YYYY-MM). */
export function monthDays(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * What to pull for a month: whole weeks around it, so the free classes of a
 * week that starts in the previous month are decided right. Split into
 * one-week windows to stay well inside Mana's limits.
 */
export function pullWindow(month: string): { from: Date; to: Date; weeks: { from: Date; to: Date }[] } {
  const { first, last } = monthDays(month);
  const start = mondayOf(first);
  const end = addDays(mondayOf(last), 7);
  const weeks: { from: Date; to: Date }[] = [];
  for (let day = start; day < end; day = addDays(day, 7)) {
    weeks.push({ from: startOfDayInStockholm(day), to: startOfDayInStockholm(addDays(day, 7)) });
  }
  return { from: startOfDayInStockholm(start), to: startOfDayInStockholm(end), weeks };
}

export const minutesOf = (w: Pick<Work, "startsAt" | "endsAt">) => Math.max(0, Math.round((w.endsAt.getTime() - w.startsAt.getTime()) / 60_000));

/** Whether a piece of work counts as worked: group classes and courses always, PT and Onramp only when completed. */
export const counts = (w: Pick<Work, "source" | "status">) => w.source !== "service" || w.status === "completed";

const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export type PersonResult = {
  personId: string;
  name: string;
  /** Hours per type key, in the month. */
  byType: Record<string, number>;
  freeClasses: number;
  freeHours: number;
  /** Paid hours minus free hours. */
  toPay: number;
};

export type MonthResult = {
  month: string;
  people: PersonResult[];
  /** The types that occur, with their rule (paid null = not decided yet). */
  types: Rule[];
  /** Counted work in the month with no instructor, or one not linked to a person. */
  unassigned: { id: string; typeLabel: string; startsAt: string; instructorId: string | null; minutes: number }[];
  /** PT and Onramp bookings in the month that did not count (booked, canceled, refunded, no-show), by status. */
  notCounted: Record<string, number>;
};

export function calculateMonth(input: { month: string; work: Work[]; people: Person[]; rules: Rule[] }): MonthResult {
  const { month } = input;
  const inMonth = (w: Work) => todayInStockholm(w.startsAt).slice(0, 7) === month;
  const rule = new Map(input.rules.map((r) => [r.typeKey, r]));
  const personByInstructor = new Map(input.people.filter((p) => p.manaInstructorId).map((p) => [p.manaInstructorId!, p]));

  const notCounted: Record<string, number> = {};
  for (const w of input.work) {
    if (inMonth(w) && !counts(w)) notCounted[w.status ?? "okänd"] = (notCounted[w.status ?? "okänd"] ?? 0) + 1;
  }
  const counted = input.work.filter(counts);

  const types = new Map<string, Rule>();
  for (const w of counted.filter(inMonth)) {
    types.set(w.typeKey, rule.get(w.typeKey) ?? { typeKey: w.typeKey, label: w.typeLabel, source: w.source, paid: null });
  }

  const unassigned = counted
    .filter((w) => inMonth(w) && (!w.instructorId || !personByInstructor.has(w.instructorId)))
    .map((w) => ({ id: w.id, typeLabel: w.typeLabel, startsAt: w.startsAt.toISOString(), instructorId: w.instructorId, minutes: minutesOf(w) }));

  const people: PersonResult[] = input.people.map((p) => {
    const own = p.manaInstructorId ? counted.filter((w) => w.instructorId === p.manaInstructorId) : [];

    // Free classes: per week, the first N paid group classes (not Tegenbutik), from the active-from day.
    const free = new Set<string>();
    if (p.freeClassesPerWeek > 0) {
      const byWeek = new Map<string, Work[]>();
      for (const w of own) {
        const day = todayInStockholm(w.startsAt);
        if (w.source !== "class" || rule.get(w.typeKey)?.paid !== true || neverFree.test(w.typeLabel)) continue;
        if (p.activeFrom && day < p.activeFrom) continue;
        const week = mondayOf(day);
        byWeek.set(week, [...(byWeek.get(week) ?? []), w]);
      }
      for (const list of byWeek.values()) {
        list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
        for (const w of list.slice(0, p.freeClassesPerWeek)) free.add(w.id);
      }
    }

    const byTypeMinutes: Record<string, number> = {};
    let paidMinutes = 0;
    let freeMinutes = 0;
    let freeClasses = 0;
    for (const w of own.filter(inMonth)) {
      const m = minutesOf(w);
      byTypeMinutes[w.typeKey] = (byTypeMinutes[w.typeKey] ?? 0) + m;
      if (rule.get(w.typeKey)?.paid === true) paidMinutes += m;
      if (free.has(w.id)) {
        freeMinutes += m;
        freeClasses += 1;
      }
    }
    return {
      personId: p.id,
      name: p.name,
      byType: Object.fromEntries(Object.entries(byTypeMinutes).map(([k, m]) => [k, hours(m)])),
      freeClasses,
      freeHours: hours(freeMinutes),
      toPay: hours(paidMinutes - freeMinutes),
    };
  });

  return {
    month,
    people: people.sort((a, b) => a.name.localeCompare(b.name, "sv")),
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

/** The month salaries are usually run for: the one before today's. */
export function previousMonth(today: string): string {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
