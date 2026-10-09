const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Tegen's time zone as YYYY-MM-DD (the Swedish format is already that). */
export function todayInStockholm(now: Date = new Date()): string {
  return dayFormatter.format(now);
}

export type DueState = "overdue" | "today" | "later";

/** An open task is overdue when its day has passed, due today until the day ends. */
export function dueState(dueDate: string, today: string): DueState {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "later";
}

/** A lead assigned to somebody else is shown greyed out. Unassigned and own leads look normal. */
export function isGreyedOut(assignedToId: string | null | undefined, viewerId: string): boolean {
  return Boolean(assignedToId) && assignedToId !== viewerId;
}
