import type { MirroredMembership } from "./membership";

export type SignalKind = "cancelled" | "freeze" | "ended" | "day_pass";

export type MembershipSignal = { kind: Exclude<SignalKind, "day_pass">; membership: MirroredMembership; date: string | null };

const DAY = 86_400_000;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** The day a membership ends or ended. Mana keeps it on the cancel, not in cancelEffectiveDate (that is only the notice date). */
export function endDayOf(m: MirroredMembership): string | null {
  return m.pendingChangeKind === "cancel" ? m.pendingChangeDate : null;
}

/**
 * Finds what in a person's memberships is worth a win-back lead:
 *
 * - cancelled: an active membership with a cancellation scheduled, when the
 *   person has no other membership that carries on (a switch from one plan
 *   to another is not someone leaving)
 * - freeze: an active membership with a freeze scheduled
 * - ended: a membership that ended within the last `endedWithinDays`, when
 *   the person has nothing that carries on
 *
 * Memberships the owners have marked as not counting are ignored.
 */
export function membershipSignals(
  memberships: MirroredMembership[],
  ignoredIds: string[],
  today: string,
  endedWithinDays = 30,
): MembershipSignal[] {
  const counting = memberships.filter((m) => !ignoredIds.includes(m.membershipId));
  const carriesOn = (except: MirroredMembership) =>
    counting.some(
      (m) => m !== except && (m.status === "active" || m.status === "future") && m.pendingChangeKind !== "cancel",
    );
  const earliest = addDays(today, -endedWithinDays);
  const signals: MembershipSignal[] = [];
  for (const m of counting) {
    if (m.status === "active" && m.pendingChangeKind === "cancel" && !carriesOn(m)) {
      signals.push({ kind: "cancelled", membership: m, date: endDayOf(m) });
    }
    if (m.status === "active" && m.pendingChangeKind === "freeze") {
      signals.push({ kind: "freeze", membership: m, date: m.pendingChangeDate });
    }
    if (m.status === "ended" && !carriesOn(m)) {
      const end = endDayOf(m);
      if (end && end >= earliest && end <= today) signals.push({ kind: "ended", membership: m, date: end });
    }
  }
  return signals;
}

/**
 * A recent day pass, clip card or drop-in class buyer is worth a lead when they
 * hold no membership that counts.
 */
export function isDayPassProspect(
  memberships: MirroredMembership[],
  ignoredIds: string[],
  lastPurchaseDay: string | null,
  today: string,
  withinDays = 30,
): boolean {
  if (!lastPurchaseDay || lastPurchaseDay < addDays(today, -withinDays)) return false;
  return !memberships.some(
    (m) => !ignoredIds.includes(m.membershipId) && (m.status === "active" || m.status === "future"),
  );
}

/** Mana's payment kinds that mean "trying the gym without a membership". */
export const dayPassKinds = ["class_credits_bundle", "single_class"] as const;
