import type { AtRiskEmail, AtRiskEmails } from "@/db/schema";
import { fillTemplate, firstName } from "@/lib/email/template";

export { firstName };

/**
 * Working the Hör av dig till list (ticket 13, follow-up): which group a
 * member is in, the email for their group, and sharing the list among staff.
 * Pure, so every rule is tested on its own.
 */

/**
 * never: no visit at all in Mana (they may have stopped, or get in some other way). away: came, then stopped.
 * new: a new member who has not been in for 10 days (ticket 34), whether they came at first or not.
 * cancelling and freezing: a notice given or a freeze ahead in Mana (they are still members).
 * ended, day_pass and klippkort: from Mana too, once a leads source (decided by Max, 2026-10-27):
 * a membership that has ended, a day pass without a membership, a klippkort nearly used up.
 */
export type AtRiskGroup = "never" | "away" | "new" | "cancelling" | "freezing" | "ended" | "day_pass" | "klippkort";

/** Why someone is on the list: away (by visits), or something Mana shows. */
export type AtRiskCause = "away" | "cancelling" | "freezing" | (typeof fromManaCauses)[number];
/** The rows Mana's signals make (detectWinBacks): handled once, closed when the person holds a membership again. */
export const fromManaCauses = ["ended", "day_pass", "klippkort"] as const;

/** never or away, by visits alone; the list puts new members in their own group. Also picks the email template. */
export const groupOf = (row: { lastVisitAt: Date | null }): "never" | "away" => (row.lastVisitAt ? "away" : "never");

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

/**
 * The template for a member's group, filled in for them (for the composer in
 * Tegen HQ). Only those away have one: "we miss you" is the wrong note for
 * someone who has just given notice, left, or only bought a day pass.
 */
export function atRiskDraft(row: { name: string | null; lastVisitAt: Date | null; group?: AtRiskGroup }, emails: AtRiskEmails | null): AtRiskEmail {
  if (row.group && row.group !== "never" && row.group !== "away" && row.group !== "new") return { subject: "", body: "" };
  const template = (emails ?? emptyEmails)[groupOf(row)];
  return { subject: fillTemplate(template.subject, row.name), body: fillTemplate(template.body, row.name) };
}
