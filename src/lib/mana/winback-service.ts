import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  lead,
  leadEvent,
  leadNote,
  manaMember,
  manaMembership,
  manaPurchase,
  manaSignal,
  person,
  pipelineStage,
  studioSettings,
  winBackReason,
} from "@/db/schema";
import { formatDay } from "@/lib/format";
import { initialStage, isWinBackSource, type ManaSignalSource } from "@/lib/leads/constants";
import { t } from "@/lib/i18n";
import { todayInStockholm } from "@/lib/tasks/dates";
import { getIgnoredMembershipIds } from "./leads";
import { customerRole } from "./membership";
import { dayPassKinds, isDayPassProspect, membershipSignals, type SignalKind } from "./winback";

type Db = typeof defaultDb;

const DAY = 86_400_000;
const sourceFor: Record<SignalKind, ManaSignalSource> = {
  cancelled: "mana_cancelled",
  freeze: "mana_freeze",
  ended: "mana_ended",
  day_pass: "mana_day_pass",
};

/** A person dismissed (moved to a cold stage) this recently is not nagged about again. */
export const recentlyDismissedDays = 90;

type Payment = { id: string; user: { id: string } | null; paidAt: string | null; status: string; kind: string; description: string | null };

/** How far before the last run a partial night looks for payments, so a slow or late night misses nothing. */
const paymentsMarginMs = 2 * DAY;

/**
 * Keeps recent day pass, clip card and drop-in purchases (35 days back). Also
 * says who has a payment in any state since `since` (draft, pending, paid...),
 * so a partial sync knows whose memberships may have changed (ticket 28).
 *
 * A full night (no `since`) reads the paid payments of the last 35 days. A
 * partial night reads every payment created since the last run (with a
 * margin) instead: far fewer requests, and the day passes in it are the new
 * ones; older ones are already stored.
 */
export async function syncPurchases(
  db: Db,
  source: { getPaidPayments(fromAt: string): Promise<Payment[]>; getPayments(fromAt: string): Promise<Payment[]> },
  studioId: string,
  now: Date = new Date(),
  since: Date | null = null,
): Promise<{ saved: number; payers: string[] }> {
  const payments = since
    ? await source.getPayments(new Date(since.getTime() - paymentsMarginMs).toISOString())
    : await source.getPaidPayments(new Date(now.getTime() - 35 * DAY).toISOString());
  const rows = payments
    .filter((p) => p.user && p.paidAt && p.status === "paid" && (dayPassKinds as readonly string[]).includes(p.kind))
    .map((p) => ({
      studioId,
      id: p.id,
      manaUserId: p.user!.id,
      kind: p.kind,
      description: p.description,
      paidAt: new Date(p.paidAt!),
    }));
  if (rows.length > 0) await db.insert(manaPurchase).values(rows).onConflictDoNothing();
  // Older purchases are no longer needed.
  await db
    .delete(manaPurchase)
    .where(and(eq(manaPurchase.studioId, studioId), lt(manaPurchase.paidAt, new Date(now.getTime() - 60 * DAY))));
  const payers = since ? [...new Set(payments.filter((p) => p.user).map((p) => p.user!.id))] : [];
  return { saved: rows.length, payers };
}

/** Finds or creates the CRM person for a Mana person (by link, then email, then phone). */
async function personForMember(db: Db, studioId: string, manaUserId: string) {
  const [member] = await db
    .select()
    .from(manaMember)
    .where(and(eq(manaMember.studioId, studioId), eq(manaMember.manaUserId, manaUserId)))
    .limit(1);
  if (!member) return null;
  const matchers = [eq(person.manaUserId, manaUserId)];
  if (member.emailNormalized) matchers.push(eq(person.emailNormalized, member.emailNormalized));
  if (member.phoneNormalized) matchers.push(eq(person.phoneNormalized, member.phoneNormalized));
  const [existing] = await db
    .select()
    .from(person)
    .where(and(eq(person.studioId, studioId), or(...matchers)))
    .orderBy(person.createdAt)
    .limit(1);
  if (existing) {
    if (!existing.manaUserId) await db.update(person).set({ manaUserId }).where(eq(person.id, existing.id));
    return existing;
  }
  const [created] = await db
    .insert(person)
    .values({
      studioId,
      name: member.name ?? member.email ?? "Okänd",
      email: member.email,
      emailNormalized: member.emailNormalized,
      phone: member.phone,
      phoneNormalized: member.phoneNormalized,
      manaUserId,
    })
    .returning();
  return created;
}

/** Why a signal must not become a new lead, if it must not. Adds a note to an open lead instead. */
async function reasonToSkip(db: Db, studioId: string, personId: string, now: Date): Promise<{ skip: string; openLeadId?: string } | null> {
  const leads = await db
    .select({ id: lead.id, kind: pipelineStage.kind })
    .from(lead)
    .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
    .where(and(eq(lead.studioId, studioId), eq(lead.personId, personId)))
    .orderBy(desc(lead.createdAt));
  const open = leads.find((l) => l.kind === "open");
  if (open) return { skip: "open_lead", openLeadId: open.id };
  if (leads.length > 0) {
    const coldKeys = (
      await db
        .select({ key: pipelineStage.key })
        .from(pipelineStage)
        .where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.kind, "cold")))
    ).map((s) => s.key);
    if (coldKeys.length > 0) {
      const [recent] = await db
        .select({ id: leadEvent.id })
        .from(leadEvent)
        .where(
          and(
            inArray(
              leadEvent.leadId,
              leads.map((l) => l.id),
            ),
            eq(leadEvent.type, "stage_changed"),
            inArray(leadEvent.toStage, coldKeys),
            gte(leadEvent.createdAt, new Date(now.getTime() - recentlyDismissedDays * DAY)),
          ),
        )
        .limit(1);
      if (recent) return { skip: "recently_dismissed" };
    }
  }
  return null;
}

function describeSignal(kind: SignalKind, name: string, date: string | null): string {
  const when = date ? formatDay(date) : "";
  switch (kind) {
    case "cancelled":
      return t("winback.noteCancelled", { name, date: when });
    case "freeze":
      return t("winback.noteFreeze", { name, date: when });
    case "ended":
      return t("winback.noteEnded", { name, date: when });
    case "day_pass":
      return t("winback.noteDayPass", { name, date: when });
  }
}

/** Turns one signal into a lead (or a note on an open lead), and records it so it never happens twice. */
async function handleSignal(
  db: Db,
  studioId: string,
  signal: { kind: SignalKind; manaRef: string; manaUserId: string; detail: string },
  now: Date,
): Promise<"created" | "skipped" | "seen"> {
  const [seen] = await db
    .select({ ref: manaSignal.manaRef })
    .from(manaSignal)
    .where(and(eq(manaSignal.studioId, studioId), eq(manaSignal.kind, signal.kind), eq(manaSignal.manaRef, signal.manaRef)))
    .limit(1);
  if (seen) return "seen";

  const p = await personForMember(db, studioId, signal.manaUserId);
  if (!p) return "seen";

  const skip = await reasonToSkip(db, studioId, p.id, now);
  if (skip) {
    if (skip.openLeadId) {
      await db.insert(leadNote).values({ studioId, leadId: skip.openLeadId, body: signal.detail });
      await db.update(lead).set({ updatedAt: now }).where(eq(lead.id, skip.openLeadId));
    }
    await db
      .insert(manaSignal)
      .values({ studioId, kind: signal.kind, manaRef: signal.manaRef, manaUserId: signal.manaUserId, skipped: skip.skip })
      .onConflictDoNothing();
    return "skipped";
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(lead)
      .values({ studioId, personId: p.id, source: sourceFor[signal.kind], stage: initialStage })
      .returning();
    await tx.insert(leadNote).values({ studioId, leadId: created.id, body: signal.detail });
    await tx
      .insert(manaSignal)
      .values({ studioId, kind: signal.kind, manaRef: signal.manaRef, manaUserId: signal.manaUserId, leadId: created.id });
    return "created" as const;
  });
}

/**
 * Looks through the Mana mirror for people leaving, pausing or only buying
 * day passes, and makes a win-back lead for each (see `membershipSignals` and
 * `isDayPassProspect`). Does nothing until an owner has switched it on.
 * A signal is handled once: it never makes a second lead, even after the first
 * is closed. A person who is already an open lead gets a note instead, and one
 * dismissed in the last 90 days is left alone.
 */
export async function detectWinBacks(db: Db, studioId: string, now: Date = new Date()) {
  const result = { created: 0, skipped: 0 };
  const [settings] = await db
    .select({ enabled: studioSettings.winBackEnabled, addOns: studioSettings.addOnMembershipIds })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  if (!settings?.enabled) return result;

  const today = todayInStockholm(now);
  // Add-ons such as a locker do not keep someone "in" when they cancel their gym membership.
  const ignored = [...(await getIgnoredMembershipIds(db, studioId)), ...settings.addOns];
  // Only customers can be won back: staff and owners hold coach memberships and lockers too, and buy classes.
  const ofCustomers = (manaUserId: typeof manaMembership.manaUserId | typeof manaPurchase.manaUserId) =>
    and(eq(manaMember.studioId, studioId), eq(manaMember.manaUserId, manaUserId), eq(manaMember.role, customerRole));
  const memberships = (
    await db
      .select({ m: manaMembership })
      .from(manaMembership)
      .innerJoin(manaMember, ofCustomers(manaMembership.manaUserId))
      .where(eq(manaMembership.studioId, studioId))
  ).map((r) => r.m);
  const byUser = new Map<string, typeof memberships>();
  for (const m of memberships) byUser.set(m.manaUserId, [...(byUser.get(m.manaUserId) ?? []), m]);

  const signals: { kind: SignalKind; manaRef: string; manaUserId: string; detail: string }[] = [];
  for (const [manaUserId, list] of byUser) {
    for (const s of membershipSignals(list, ignored, today)) {
      signals.push({
        kind: s.kind,
        manaRef: s.membership.id,
        manaUserId,
        detail: describeSignal(s.kind, s.membership.name, s.date),
      });
    }
  }

  const recentPurchases = (
    await db
      .select({ p: manaPurchase })
      .from(manaPurchase)
      .innerJoin(manaMember, ofCustomers(manaPurchase.manaUserId))
      .where(and(eq(manaPurchase.studioId, studioId), gte(manaPurchase.paidAt, new Date(now.getTime() - 30 * DAY))))
      .orderBy(desc(manaPurchase.paidAt))
  ).map((r) => r.p);
  const latestByUser = new Map<string, (typeof recentPurchases)[number]>();
  for (const p of recentPurchases) if (!latestByUser.has(p.manaUserId)) latestByUser.set(p.manaUserId, p);
  for (const [manaUserId, purchase] of latestByUser) {
    const day = todayInStockholm(purchase.paidAt);
    if (isDayPassProspect(byUser.get(manaUserId) ?? [], ignored, day, today)) {
      signals.push({
        kind: "day_pass",
        manaRef: manaUserId, // one day-pass lead per person
        manaUserId,
        detail: describeSignal("day_pass", purchase.description ?? "", day),
      });
    }
  }

  for (const s of signals) {
    const outcome = await handleSignal(db, studioId, s, now);
    if (outcome === "created") result.created += 1;
    if (outcome === "skipped") result.skipped += 1;
  }
  return result;
}

export class WinBackError extends Error {
  constructor(public code: "not_found" | "not_win_back" | "unknown_reason") {
    super(code);
  }
}

/** Records why a win-back lead's person left or paused. */
export async function setWinBackReason(db: Db, studioId: string, leadId: string, reasonKey: string) {
  const [found] = await db
    .select()
    .from(lead)
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!found) throw new WinBackError("not_found");
  if (!isWinBackSource(found.source)) throw new WinBackError("not_win_back");
  const [reason] = await db
    .select()
    .from(winBackReason)
    .where(and(eq(winBackReason.studioId, studioId), eq(winBackReason.key, reasonKey)))
    .limit(1);
  if (!reason) throw new WinBackError("unknown_reason");
  const [updated] = await db
    .update(lead)
    .set({ winBackReason: reason.key, updatedAt: new Date() })
    .where(eq(lead.id, leadId))
    .returning();
  return updated;
}

export async function setWinBackEnabled(db: Db, studioId: string, enabled: boolean) {
  await db.update(studioSettings).set({ winBackEnabled: enabled, updatedAt: new Date() }).where(eq(studioSettings.studioId, studioId));
}

export async function setAddOnMemberships(db: Db, studioId: string, ids: string[]) {
  await db
    .update(studioSettings)
    .set({ addOnMembershipIds: [...new Set(ids)].sort(), updatedAt: new Date() })
    .where(eq(studioSettings.studioId, studioId));
}
