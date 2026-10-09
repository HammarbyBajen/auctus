const formatter = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

/** Swedish date and time in Tegen's time zone, for example "9 okt. 2026 10:15". */
export function formatDateTime(date: Date): string {
  return formatter.format(date);
}
