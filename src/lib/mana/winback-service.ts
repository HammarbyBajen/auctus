import { and, desc, eq, gte, inArray, lt, ne, or } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
  atRiskAlert,
  atRiskNote,
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
  task,
} from "@/db/schema";
import { formatDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { todayInStockholm } from "@/lib/tasks/dates";
import { fromManaCauses } from "./at-risk-work";
import { getIgnoredMembershipIds } from "./leads";
import { customerRole } from "./membership";
import { keepBundlePurchasesDays } from "./klippkort";
import { klippkortSignals } from "./klippkort-service";
import { dayPassKinds, isDayPassProspect, membershipSignals, type SignalKind } from "./winback";

type Db = typeof defaultDb;

const DAY = 86_400_000;
/** A person dismissed as a lead (moved to a cold stage) this recently is not nagged about again. */
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
  // Older purchases are no longer needed; a bundle (a klippkort) is kept while it can still be in use (ticket 31).
  await db
    .delete(manaPurchase)
    .where(
      and(
        eq(manaPurchase.studioId, studioId),
        or(
          and(ne(manaPurchase.kind, "class_credits_bundle"), lt(manaPurchase.paidAt, new Date(now.getTime() - 60 * DAY))),
          lt(manaPurchase.paidAt, new Date(now.getTime() - keepBundlePurchasesDays * DAY)),
        ),
      ),
    );
  const payers = since ? [...new Set(payments.filter((p) => p.user).map((p) => p.user!.id))] : [];
  return { saved: rows.length, payers };
}

/** The CRM person for a Mana member, if there is one. Mana's signals no longer make people or leads. */
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
  return existing ?? null;
}

/** Why a signal must not go on the Medlemmar list, if it must not: the person is being sold to already, or said no lately. */
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

function describeSignal(kind: "ended" | "day_pass", name: string, date: string | null): string {
  const when = date ? formatDay(date) : "";
  return kind === "ended" ? t("winback.noteEnded", { name, date: when }) : t("winback.noteDayPass", { name, date: when });
}

/** The signals that go on the Medlemmar list; notices and freezes are kept there by detectLeaving. */
type RowSignalKind = Exclude<SignalKind, "cancelled" | "freeze">;

type Signal = {
  kind: RowSignalKind;
  manaRef: string;
  manaUserId: string;
  /** What Mana shows, in a line: kept as the row's first note. */
  detail: string;
  /** For ended, the last day; for a day pass, the day bought; for a klippkort, the day it expires, if soon. */
  changeDate: string | null;
  /** For someone who is already a lead: a task for today on their lead, as well as the note (ticket 31). */
  task?: string;
};

/**
 * Puts one signal on the Medlemmar list (or, for someone already being sold
 * to, a note on their lead), and records it so it never happens twice. A
 * member has one open row per kind, and a buyer one row in all: a klippkort
 * counts as a day pass when bought, so its row turns into a Klippkort row when
 * the card runs low. A later signal is added to the open row as a note.
 */
async function handleSignal(db: Db, studioId: string, signal: Signal, now: Date): Promise<"created" | "skipped" | "seen"> {
  const [seen] = await db
    .select({ ref: manaSignal.manaRef })
    .from(manaSignal)
    .where(and(eq(manaSignal.studioId, studioId), eq(manaSignal.kind, signal.kind), eq(manaSignal.manaRef, signal.manaRef)))
    .limit(1);
  if (seen) return "seen";
  const record = (tx: Db, skipped: string | null) =>
    tx.insert(manaSignal).values({ studioId, kind: signal.kind, manaRef: signal.manaRef, manaUserId: signal.manaUserId, skipped }).onConflictDoNothing();

  const p = await personForMember(db, studioId, signal.manaUserId);
  const skip = p ? await reasonToSkip(db, studioId, p.id, now) : null;
  if (skip?.openLeadId) {
    // Someone already being sold to stays in Leads: the news goes on their lead.
    await db.insert(leadNote).values({ studioId, leadId: skip.openLeadId, body: t("winback.leadNote", { detail: signal.detail }) });
    if (signal.task) await db.insert(task).values({ studioId, leadId: skip.openLeadId, title: signal.task, dueDate: todayInStockholm(now) });
    await db.update(lead).set({ updatedAt: now }).where(eq(lead.id, skip.openLeadId));
    await record(db, skip.skip);
    return "skipped";
  }
  // A klippkort running out is news even about someone who said no lately: they still train, and still pay.
  if (skip && signal.kind !== "klippkort") {
    await record(db, skip.skip);
    return "skipped";
  }

  const buyer = ["day_pass", "klippkort"];
  const [open] = await db
    .select({ id: atRiskAlert.id, cause: atRiskAlert.cause })
    .from(atRiskAlert)
    .where(
      and(
        eq(atRiskAlert.studioId, studioId),
        eq(atRiskAlert.manaUserId, signal.manaUserId),
        inArray(atRiskAlert.cause, buyer.includes(signal.kind) ? buyer : [signal.kind]),
        eq(atRiskAlert.status, "open"),
      ),
    )
    .limit(1);
  await db.transaction(async (tx) => {
    let alertId = open?.id;
    if (alertId) {
      // A day pass on a Klippkort row is only a note; anything else takes the row over, with its date.
      if (!(signal.kind === "day_pass" && open.cause === "klippkort")) {
        await tx.update(atRiskAlert).set({ cause: signal.kind, ...(signal.changeDate ? { changeDate: signal.changeDate } : {}) }).where(eq(atRiskAlert.id, alertId));
      }
    } else {
      [{ id: alertId }] = await tx
        .insert(atRiskAlert)
        .values({ studioId, manaUserId: signal.manaUserId, cause: signal.kind, changeDate: signal.changeDate, createdAt: now })
        .returning({ id: atRiskAlert.id });
    }
    await tx.insert(atRiskNote).values({ studioId, manaUserId: signal.manaUserId, alertId, kind: "mana", body: signal.detail, createdAt: now });
    await record(tx as unknown as Db, null);
  });
  return open ? "skipped" : "created";
}

/**
 * Looks through the Mana mirror for people whose membership has ended, who
 * only buy day passes, or whose klippkort is nearly used up (ticket 31), and
 * puts each on the Medlemmar list: Har slutat, Dagpass or Klippkort (decided
 * by Max, 2026-10-27: Mana makes no leads; staff add a lead by hand when
 * someone wants to talk membership). Does nothing until an owner has switched
 * it on. A signal is handled once, even after its row is handled. A person
 * who is already an open lead gets a note on the lead instead, and one
 * dismissed as a lead in the last 90 days is left alone. A row closes by
 * itself when the person holds a membership again.
 */
export async function detectWinBacks(db: Db, studioId: string, now: Date = new Date()) {
  const result = { created: 0, skipped: 0, resolved: 0 };
  const [settings] = await db
    .select({ enabled: studioSettings.winBackEnabled, addOns: studioSettings.addOnMembershipIds })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  if (!settings?.enabled) return result;

  const today = todayInStockholm(now);
  // Add-ons such as a locker do not keep someone "in" when they cancel their gym membership.
  const ignored = [...(await getIgnoredMembershipIds(db, studioId)), ...settings.addOns];
  // Only customers: staff and owners hold coach memberships and lockers too, and buy classes.
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

  const signals: Signal[] = [];
  for (const [manaUserId, list] of byUser) {
    for (const s of membershipSignals(list, ignored, today)) {
      // Notices and freezes are members still: detectLeaving keeps them on the list.
      if (s.kind !== "ended") continue;
      signals.push({ kind: s.kind, manaRef: s.membership.id, manaUserId, detail: describeSignal(s.kind, s.membership.name, s.date), changeDate: s.date });
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
        manaRef: manaUserId, // once per person
        manaUserId,
        detail: describeSignal("day_pass", (purchase.description ?? "").replace(/^Credit bundle: /, ""), day),
        changeDate: day,
      });
    }
  }

  // Klippkort nearly used up or about to expire (ticket 31).
  for (const k of await klippkortSignals(db, studioId, now)) signals.push({ kind: "klippkort", ...k });

  for (const s of signals) {
    const outcome = await handleSignal(db, studioId, s, now);
    if (outcome === "created") result.created += 1;
    if (outcome === "skipped") result.skipped += 1;
  }

  // Back as a member: their row for having left, a day pass or a klippkort closes by itself.
  const holdsMembership = (manaUserId: string) =>
    (byUser.get(manaUserId) ?? []).some((m) => !ignored.includes(m.membershipId) && (m.status === "active" || m.status === "future"));
  const open = await db
    .select({ id: atRiskAlert.id, manaUserId: atRiskAlert.manaUserId })
    .from(atRiskAlert)
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.status, "open"), inArray(atRiskAlert.cause, [...fromManaCauses])));
  const resolve = open.filter((a) => holdsMembership(a.manaUserId)).map((a) => a.id);
  if (resolve.length > 0) await db.update(atRiskAlert).set({ status: "resolved", handledAt: now }).where(inArray(atRiskAlert.id, resolve));
  result.resolved = resolve.length;
  return result;
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
