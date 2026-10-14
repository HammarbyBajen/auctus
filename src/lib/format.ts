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

const numberFormatter = new Intl.NumberFormat("sv-SE");
const percentFormatter = new Intl.NumberFormat("sv-SE", { style: "percent", maximumFractionDigits: 1 });

/** A whole or decimal number the Swedish way ("1 234,5"). */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** A share the Swedish way, with a non-breaking space before the sign ("10 %"). */
export function formatPercent(share: number): string {
  return percentFormatter.format(share).replace(/\s%/, " %");
}

const monthFormatter = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" });

/** A month (YYYY-MM) in Swedish, for example "oktober 2026". */
export function formatMonth(month: string): string {
  return monthFormatter.format(new Date(`${month}-15T12:00:00Z`));
}

const hoursFormatter = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Hours as a decimal the Swedish way ("1,5"). */
export function formatHours(hours: number): string {
  return hoursFormatter.format(hours);
}
