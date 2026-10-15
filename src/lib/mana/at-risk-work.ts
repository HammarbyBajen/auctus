import type { AtRiskEmail, AtRiskEmails } from "@/db/schema";
import { fillTemplate, firstName } from "@/lib/email/template";

export { firstName };

/**
 * Working the Hör av dig till list (ticket 13, follow-up): which group a
 * member is in, the email for their group, and sharing the list among staff.
 * Pure, so every rule is tested on its own.
 */

/** never: no visit at all in Mana (they may have stopped, or get in some other way). away: came, then stopped. */
export type AtRiskGroup = "never" | "away";

export const groupOf = (row: { lastVisitAt: Date | null }): AtRiskGroup => (row.lastVisitAt ? "away" : "never");

export const emptyEmails: AtRiskEmails = { never: { subject: "", body: "" }, away: { subject: "", body: "" } };

/**
 * Shares unassigned members among the chosen staff, in list order (longest
 * away first), so everyone gets a fair mix. Returns alert id → user id.
 */
export function distribute(alertIds: string[], userIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  alertIds.forEach((id, i) => out.set(id, userIds[i % userIds.length]));
  return out;
}

/** The template for a member's group, filled in for them (for the composer in Tegen HQ). */
export function atRiskDraft(row: { name: string | null; lastVisitAt: Date | null }, emails: AtRiskEmails | null): AtRiskEmail {
  const template = (emails ?? emptyEmails)[groupOf(row)];
  return { subject: fillTemplate(template.subject, row.name), body: fillTemplate(template.body, row.name) };
}
