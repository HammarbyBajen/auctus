/**
 * Parking a lead ("Vänta till", ticket 29): when the lead asked to wait or staff
 * are waiting for a reply, the lead gets a follow-up task for a later day. An
 * open task counts as handled, so the lead leaves Home until then.
 */

export const parkPresets = ["1w", "2w", "1m"] as const;
export type ParkPreset = (typeof parkPresets)[number];

const asDay = (d: Date) => d.toISOString().slice(0, 10);

/** The day a preset lands on, from today (YYYY-MM-DD, Stockholm). A month keeps the day of the month, or its last day. */
export function parkDay(today: string, preset: ParkPreset): string {
  const [y, m, d] = today.split("-").map(Number);
  if (preset === "1m") {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return asDay(new Date(Date.UTC(y, m, Math.min(d, last))));
  }
  return asDay(new Date(Date.UTC(y, m - 1, d + (preset === "1w" ? 7 : 14))));
}

/** The day after `day` (YYYY-MM-DD): the earliest a lead can be parked until. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return asDay(new Date(Date.UTC(y, m - 1, d + 1)));
}

/** A day the lead can be parked until: a real date after today. */
export function isParkDay(day: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && asDay(date) === day && day > today;
}
