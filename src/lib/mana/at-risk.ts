import { countsOn, type KpiMembership } from "@/lib/kpi/members";
import { daysBetween } from "@/lib/leads/activity";
import { todayInStockholm } from "@/lib/tasks/dates";

/**
 * At-risk rule 1 (ticket 13): a paying member with no visit in the last
 * `days` days. Paying follows the home page's numbers (a price above 0, not
 * cancelled, not frozen), so a member on a freeze is never at risk. A member
 * who has never come in is at risk once they have paid for `days` days.
 *
 * New members (ticket 34) are watched closer: someone whose first membership
 * started in the last 8 weeks is flagged after 10 days without a visit,
 * counted from their start when they have not been in at all. The first
 * weeks decide whether a new member stays. Memberships moved over on the
 * studio's first day in Mana are not new.
 */

/** Booking statuses that mean the person came (or was expected and not marked absent). */
export const visitStatuses = ["booked", "checked_in"] as const;

export type AtRisk = { manaUserId: string; lastVisitAt: Date | null; daysAway: number; isNew: boolean };

/** How long someone counts as a new member, from their first membership's start. */
export const newMemberWeeks = 8;
/** Days without a visit before a new member is flagged. */
export const newMemberDays = 10;

/**
 * Whether someone is a new member today: their first membership started
 * within the last 8 weeks, and after the studio's first day of data (the
 * memberships moved into Mana that day are not new).
 */
export function isNewMember(firstStart: string, firstDayOfData: string, today: string): boolean {
  return firstStart > firstDayOfData && daysBetween(firstStart, today) < newMemberWeeks * 7;
}

export function atRiskMembers(
  memberships: KpiMembership[],
  lastVisitByUser: Map<string, Date>,
  today: string,
  days: number,
): AtRisk[] {
  // Everyone's first membership, paying or not, and the studio's first day of data.
  const firstStart = new Map<string, string>();
  let firstDayOfData: string | null = null;
  for (const m of memberships) {
    const first = firstStart.get(m.manaUserId);
    if (!first || m.startDate < first) firstStart.set(m.manaUserId, m.startDate);
    if (!firstDayOfData || m.startDate < firstDayOfData) firstDayOfData = m.startDate;
  }
  const payingSince = new Map<string, string>();
  for (const m of memberships) {
    if (!countsOn(m, today)) continue;
    const since = payingSince.get(m.manaUserId);
    if (!since || m.startDate < since) payingSince.set(m.manaUserId, m.startDate);
  }
  const out: AtRisk[] = [];
  for (const [manaUserId, since] of payingSince) {
    const last = lastVisitByUser.get(manaUserId) ?? null;
    const daysAway = daysBetween(last ? todayInStockholm(last) : since, today);
    const isNew = isNewMember(firstStart.get(manaUserId) ?? since, firstDayOfData ?? since, today);
    if (daysAway >= (isNew ? Math.min(newMemberDays, days) : days)) out.push({ manaUserId, lastVisitAt: last, daysAway, isNew });
  }
  return out.sort((a, b) => b.daysAway - a.daysAway);
}
