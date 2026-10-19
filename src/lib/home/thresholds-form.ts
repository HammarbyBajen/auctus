import type { Thresholds } from "@/db/schema";

/** Each open stage's stalled limit is sent as `stalled.<stage key>`. */
export const stalledFieldPrefix = "stalled.";

export type ThresholdsError = "firstContact" | "warn" | "stalled" | "daysOff";

const int = (value: FormDataEntryValue | null) => {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) ? n : NaN;
};

/** A real calendar day written YYYY-MM-DD. */
function isDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** Reads the deadline settings form (ticket 06), or says which field is wrong. */
export function parseThresholdsForm(form: FormData): { ok: true; value: Thresholds } | { ok: false; error: ThresholdsError } {
  const firstContactHours = int(form.get("firstContactHours"));
  const warnHoursBeforeDeadline = int(form.get("warnHoursBeforeDeadline"));
  const stalledDays = int(form.get("stalledDays"));
  if (!(firstContactHours >= 1 && firstContactHours <= 168)) return { ok: false, error: "firstContact" };
  if (!(warnHoursBeforeDeadline >= 0 && warnHoursBeforeDeadline < firstContactHours)) return { ok: false, error: "warn" };
  if (!(stalledDays >= 1 && stalledDays <= 90)) return { ok: false, error: "stalled" };
  const stalledDaysByStage: Record<string, number> = {};
  for (const [name, value] of form.entries()) {
    if (!name.startsWith(stalledFieldPrefix)) continue;
    const days = int(value);
    if (!(days >= 1 && days <= 90)) return { ok: false, error: "stalled" };
    stalledDaysByStage[name.slice(stalledFieldPrefix.length)] = days;
  }
  const clockDays = [...new Set(form.getAll("clockDays").map((d) => Number(d)))].filter((d) => d >= 1 && d <= 7).sort();
  const lines = String(form.get("daysOff") ?? "")
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.some((l) => !isDay(l))) return { ok: false, error: "daysOff" };
  const daysOff = [...new Set(lines)].sort();
  return { ok: true, value: { firstContactHours, warnHoursBeforeDeadline, stalledDays, stalledDaysByStage, clockDays, daysOff } };
}
