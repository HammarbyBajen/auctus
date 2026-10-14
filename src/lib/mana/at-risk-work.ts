import type { AtRiskEmail, AtRiskEmails } from "@/db/schema";

/**
 * Working the Hör av dig till list (ticket 13, follow-up): which group a
 * member is in, the email link, and sharing the list among staff. Pure, so
 * every rule is tested on its own.
 */

/** never: no visit at all in Mana (they may have stopped, or get in some other way). away: came, then stopped. */
export type AtRiskGroup = "never" | "away";

export const groupOf = (row: { lastVisitAt: Date | null }): AtRiskGroup => (row.lastVisitAt ? "away" : "never");

export const emptyEmails: AtRiskEmails = { never: { subject: "", body: "" }, away: { subject: "", body: "" } };

/** The first word of a name, for "Hej Anna". */
export function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(förnamn|namn)\}/g, (_, key: string) => values[key] ?? "");
}

/**
 * A mailto link that opens the staff member's own mail program, with Tegen's
 * template for the member's group filled in ({förnamn} and {namn}). Without a
 * template it only fills in the address. Tegen HQ sends nothing itself.
 */
export function mailtoFor(row: { email: string; name: string | null; lastVisitAt: Date | null }, emails: AtRiskEmails | null): string {
  const template: AtRiskEmail = (emails ?? emptyEmails)[groupOf(row)];
  const values = { förnamn: firstName(row.name), namn: (row.name ?? "").trim() };
  const params = [
    template.subject.trim() ? `subject=${encodeURIComponent(fill(template.subject.trim(), values))}` : null,
    template.body.trim() ? `body=${encodeURIComponent(fill(template.body.trim(), values).replace(/\r?\n/g, "\r\n"))}` : null,
  ].filter(Boolean);
  return `mailto:${encodeURIComponent(row.email).replace(/%40/g, "@")}${params.length ? `?${params.join("&")}` : ""}`;
}

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
