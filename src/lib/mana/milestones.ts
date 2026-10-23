import { fillTemplate } from "@/lib/email/template";

/**
 * Milstolpar (ticket 35): members reaching a number of visits in total
 * ("pass": Mana counts classes and gym check-ins alike), or of weeks in a row
 * with a visit. Mana knows each member's whole history
 * (read now and then, see member_stats); Tegen HQ counts on from the visits
 * it syncs every night. A milestone counts only when it is crossed after the
 * last check, so nobody is congratulated on a 100th class from years ago,
 * and a milestone added later applies from then on. Pure, so it is tested on
 * its own.
 */

export const milestoneKinds = ["classes_total", "weeks_in_a_row"] as const;
export type MilestoneKind = (typeof milestoneKinds)[number];

/** What a studio starts with; owners change them under Inställningar → Milstolpar. */
export const defaultMilestones: Record<MilestoneKind, { thresholds: number[]; subject: string; body: string }> = {
  classes_total: {
    thresholds: [100, 250, 500, 1000],
    subject: "{antal} pass på CrossFit Tegen",
    body: "Hej {förnamn}!\n\nI veckan passerade du {antal} pass hos oss. Stort grattis, och tack för att du tränar med oss.\n\nVi ses på gymmet,\nCrossFit Tegen",
  },
  weeks_in_a_row: {
    thresholds: [10, 26, 52],
    subject: "{antal} veckor i rad",
    body: "Hej {förnamn}!\n\nDu har tränat hos oss varje vecka i {antal} veckor i rad. Det är riktigt starkt.\n\nVi ses på gymmet,\nCrossFit Tegen",
  },
};

/** A milestone's template filled in: {förnamn} and {namn} for the member, {antal} for the number. */
export function fillMilestone(text: string, name: string | null, threshold: number): string {
  return fillTemplate(text, name).replace(/\{antal\}/g, threshold.toLocaleString("sv-SE"));
}

const DAY = 86_400_000;

/** The Monday of the week a day (YYYY-MM-DD) falls in. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
}

const weekBefore = (week: string) => new Date(Date.parse(`${week}T12:00:00Z`) - 7 * DAY).toISOString().slice(0, 10);

/**
 * Weeks in a row with a visit, up to today. This week counts once there is a
 * visit in it; until then the run up to last week stands. When the run
 * reaches back to the week Mana's figure was read, it goes on from Mana's
 * figure, whose history reaches further back than Tegen HQ's. Mana's figure
 * includes the week it was read in when there was a visit in it by then
 * (`readWeekCounted`); a first visit later that week is added here.
 */
export function weeksInARow(visitDays: string[], today: string, base: { streak: number; readOn: string; readWeekCounted: boolean }): number {
  const weeks = new Set(visitDays.filter((d) => d <= today).map(weekOf));
  const readWeek = weekOf(base.readOn);
  let week = weekOf(today);
  if (!weeks.has(week)) week = weekBefore(week);
  let run = 0;
  for (;;) {
    if (week < readWeek) return base.streak + run;
    if (week === readWeek) return base.streak + run + (weeks.has(readWeek) && !base.readWeekCounted ? 1 : 0);
    if (!weeks.has(week)) return run;
    run += 1;
    week = weekBefore(week);
  }
}

/** The milestones crossed since the last check: above the last figure, at or below the current one. */
export function crossed(last: number | null, current: number, thresholds: number[]): number[] {
  if (last === null) return [];
  return thresholds.filter((t) => t > last && t <= current).sort((a, b) => a - b);
}
