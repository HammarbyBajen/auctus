const formatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

/** Swedish date and time in Tegen's time zone, for example "9 okt. 2026 10:15". */
export function formatDateTime(date: Date): string {
  return formatter.format(date);
}

const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** A plain calendar day (YYYY-MM-DD) in Swedish, for example "15 okt.". */
export function formatDay(day: string): string {
  return dayFormatter.format(new Date(`${day}T12:00:00Z`));
}
