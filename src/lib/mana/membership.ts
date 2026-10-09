import type { StageKind } from "@/lib/pipeline/defaults";

export type MirroredMembership = {
  id: string;
  membershipId: string;
  name: string;
  status: string; // active, ended or future
  startDate: string; // YYYY-MM-DD
  cancelEffectiveDate: string | null;
  pendingChangeKind: string | null;
  pendingChangeDate: string | null;
};

/**
 * Memberships that make someone a member: active or starting soon, and not
 * something the owners have said is not a real membership (like a locker).
 */
export function countingMemberships<T extends MirroredMembership>(memberships: T[], ignoredIds: string[]): T[] {
  return memberships.filter(
    (m) => (m.status === "active" || m.status === "future") && !ignoredIds.includes(m.membershipId),
  );
}

/**
 * Picks the Mana person for a CRM person. Email first: an email that matches
 * exactly one Mana person wins. Otherwise phone, but only when exactly one Mana
 * person has that number, since a family can share a phone.
 */
export function pickManaMatch<T extends { manaUserId: string }>(byEmail: T[], byPhone: T[]): T | null {
  if (byEmail.length === 1) return byEmail[0];
  if (byEmail.length > 1) return null;
  if (byPhone.length === 1) return byPhone[0];
  return null;
}

/**
 * Whether a lead should move to Won by itself, and because of which membership.
 *
 * Only when a counting membership started on or after the day the lead came in:
 * an existing member who gets in touch (say about personal training) must not
 * be closed as Won. A lead that is already won, or that was moved to Won
 * automatically before (and perhaps moved back by an owner), is left alone.
 */
export function autoWinMembership<T extends MirroredMembership>(input: {
  stageKind: StageKind;
  leadCreatedDay: string; // YYYY-MM-DD in Tegen's time zone
  alreadyAutoWon: boolean;
  counting: T[];
}): T | null {
  if (input.stageKind === "won" || input.alreadyAutoWon) return null;
  const qualifying = input.counting
    .filter((m) => m.startDate >= input.leadCreatedDay)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return qualifying[0] ?? null;
}
