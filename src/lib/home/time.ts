import { todayInStockholm } from "@/lib/tasks/dates";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Stockholm",
  hour: "2-digit",
  hourCycle: "h23",
});

function stockholmHour(date: Date): number {
  return Number(partsFormatter.format(date));
}

/**
 * The instant when a calendar day (YYYY-MM-DD) starts in Tegen's time zone.
 * Stockholm is UTC+1 in winter and UTC+2 in summer, so try both offsets and
 * keep the one that lands on midnight of that very day.
 */
export function startOfDayInStockholm(day: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(utcMidnight - offsetHours * 3_600_000);
    if (todayInStockholm(candidate) === day && stockholmHour(candidate) === 0) return candidate;
  }
  throw new Error(`Could not find the start of ${day} in Europe/Stockholm`);
}

/** Monday of the week that contains `now`, as YYYY-MM-DD in Tegen's time zone. */
export function mondayOfWeek(now: Date = new Date()): string {
  const today = todayInStockholm(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(Date.parse(`${today}T12:00:00Z`) - daysSinceMonday * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

export function startOfWeekInStockholm(now: Date = new Date()): Date {
  return startOfDayInStockholm(mondayOfWeek(now));
}

export function startOfMonthInStockholm(now: Date = new Date()): Date {
  return startOfDayInStockholm(`${todayInStockholm(now).slice(0, 7)}-01`);
}
