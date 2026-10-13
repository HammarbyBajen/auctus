import { countsOn, type KpiMembership } from "@/lib/kpi/members";
import { daysBetween } from "@/lib/leads/activity";
import { todayInStockholm } from "@/lib/tasks/dates";

/**
 * At-risk rule 1 (ticket 13): a paying member with no visit in the last
 * `days` days. Paying follows the home page's numbers (a price above 0, not
 * cancelled, not frozen), so a member on a freeze is never at risk. A member
 * who has never come in is at risk once they have paid for `days` days, so a
 * brand-new member is not flagged before they have had a chance.
 */

/** Booking statuses that mean the person came (or was expected and not marked absent). */
export const visitStatuses = ["booked", "checked_in"] as const;

export type AtRisk = { manaUserId: string; lastVisitAt: Date | null; daysAway: number };

export function atRiskMembers(
  memberships: KpiMembership[],
  lastVisitByUser: Map<string, Date>,
  today: string,
  days: number,
): AtRisk[] {
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
    if (daysAway >= days) out.push({ manaUserId, lastVisitAt: last, daysAway });
  }
  return out.sort((a, b) => b.daysAway - a.daysAway);
}
