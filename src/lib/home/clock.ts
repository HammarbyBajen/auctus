import { todayInStockholm } from "@/lib/tasks/dates";
import { startOfDayInStockholm } from "./time";

/**
 * The deadline clock (ticket 06): the first-contact promise counts hours only
 * on the days the clock runs, so a lead that arrives on a day off is due
 * counting from the start of the next running day. Days are calendar days in
 * Tegen's time zone; weekdays are ISO numbers (1 = Monday ... 7 = Sunday).
 */
export type Clock = {
  /** ISO weekdays the clock runs. All seven means it always runs. */
  clockDays: number[];
  /** Single days off (YYYY-MM-DD), such as public holidays. */
  daysOff: string[];
};

export const allWeekdays = [1, 2, 3, 4, 5, 6, 7];

function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function clockRunsOn(day: string, clock: Clock): boolean {
  return clock.clockDays.includes(isoWeekday(day)) && !clock.daysOff.includes(day);
}

/**
 * When `hours` of running time have passed since `start`. Null when the clock
 * never runs (no weekday chosen), so there is no deadline at all.
 */
export function addRunningHours(start: Date, hours: number, clock: Clock): Date | null {
  if (clock.clockDays.length === 0) return null;
  let remaining = hours * 3_600_000;
  let cursor = start;
  // A year of days off in a row is not a real setting; stop rather than loop.
  for (let i = 0; i < 400; i++) {
    const day = todayInStockholm(cursor);
    const dayEnd = startOfDayInStockholm(nextDay(day));
    if (clockRunsOn(day, clock)) {
      const chunk = Math.min(remaining, dayEnd.getTime() - cursor.getTime());
      remaining -= chunk;
      if (remaining <= 0) return new Date(cursor.getTime() + chunk);
    }
    cursor = dayEnd;
  }
  return null;
}
