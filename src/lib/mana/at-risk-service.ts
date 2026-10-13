import { and, desc, eq, inArray, lte, max, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { atRiskAlert, manaMember, manaMembership, manaVisit, studioSettings } from "@/db/schema";
import type { KpiMembership } from "@/lib/kpi/members";
import { todayInStockholm } from "@/lib/tasks/dates";
import { atRiskMembers, visitStatuses } from "./at-risk";
import { customerRole } from "./membership";

type Db = typeof defaultDb;
const DAY = 86_400_000;

/** When Mana's data starts for Tegen: no visit can be older than this. */
const manaStart = "2026-09-01T00:00:00Z";
/** Bookings change after the class (booked → checked in or no-show), so the last days are read again each night. */
const rereadDays = 3;

export type VisitSource = {
  getClassBookings(fromAt: string, toAt: string): Promise<{ id: string; userId: string; startsAt: string; status: string }[]>;
  getGymCheckIns(fromAt: string, toAt: string): Promise<{ id: string; createdAt: string; user: { id: string } }[]>;
};

/** Mirrors class bookings and gym check-ins up to now, from a few days before the newest one already saved. */
export async function syncVisits(db: Db, source: VisitSource, studioId: string, now: Date = new Date()) {
  const [{ newest }] = await db.select({ newest: max(manaVisit.at) }).from(manaVisit).where(eq(manaVisit.studioId, studioId));
  const fromAt = newest ? new Date(newest.getTime() - rereadDays * DAY).toISOString() : manaStart;
  const toAt = now.toISOString();
  const [bookings, checkIns] = [await source.getClassBookings(fromAt, toAt), await source.getGymCheckIns(fromAt, toAt)];
  const rows = [
    ...bookings.map((b) => ({ studioId, id: b.id, manaUserId: b.userId, at: new Date(b.startsAt), kind: "class", status: b.status })),
    ...checkIns.map((c) => ({ studioId, id: `gym:${c.id}`, manaUserId: c.user.id, at: new Date(c.createdAt), kind: "gym", status: "checked_in" })),
  ].filter((r) => r.at.getTime() <= now.getTime());
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(manaVisit)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [manaVisit.studioId, manaVisit.id],
        set: { status: sql`excluded.status`, at: sql`excluded.at`, syncedAt: now },
      });
  }
  return { bookings: bookings.length, checkIns: checkIns.length };
}

/** Each person's latest visit: a gym check-in, or a past class they were booked or checked in to. */
async function lastVisits(db: Db, studioId: string, now: Date): Promise<Map<string, Date>> {
  const rows = await db
    .select({ manaUserId: manaVisit.manaUserId, last: max(manaVisit.at) })
    .from(manaVisit)
    .where(
      and(
        eq(manaVisit.studioId, studioId),
        lte(manaVisit.at, now),
        or(eq(manaVisit.kind, "gym"), inArray(manaVisit.status, [...visitStatuses])),
      ),
    )
    .groupBy(manaVisit.manaUserId);
  return new Map(rows.filter((r) => r.last).map((r) => [r.manaUserId, r.last!]));
}

/**
 * Finds the paying members who are away (after each sync) and keeps the alerts
 * in step: a new one for someone newly away, none twice for the same absence
 * (one that was marked contacted or dismissed only comes back after a new visit),
 * and an open one is resolved when the person comes back or stops paying.
 */
export async function detectAtRisk(db: Db, studioId: string, now: Date = new Date()) {
  const [settings] = await db.select({ days: studioSettings.atRiskDays }).from(studioSettings).where(eq(studioSettings.studioId, studioId)).limit(1);
  const days = settings?.days ?? 30;
  const memberships: KpiMembership[] = (
    await db
      .select({ m: manaMembership })
      .from(manaMembership)
      .innerJoin(
        manaMember,
        and(eq(manaMember.studioId, manaMembership.studioId), eq(manaMember.manaUserId, manaMembership.manaUserId), eq(manaMember.role, customerRole)),
      )
      .where(eq(manaMembership.studioId, studioId))
  ).map((r) => r.m);
  const away = atRiskMembers(memberships, await lastVisits(db, studioId, now), todayInStockholm(now), days);
  const awayIds = new Set(away.map((a) => a.manaUserId));

  const alerts = await db.select().from(atRiskAlert).where(eq(atRiskAlert.studioId, studioId)).orderBy(desc(atRiskAlert.createdAt));
  const latestFor = new Map<string, (typeof alerts)[number]>();
  for (const a of alerts) if (!latestFor.has(a.manaUserId)) latestFor.set(a.manaUserId, a);

  let created = 0;
  for (const a of away) {
    const previous = latestFor.get(a.manaUserId);
    if (previous?.status === "open") continue;
    // The same absence as one already handled: no new alert until they have been in again.
    if (previous && (a.lastVisitAt?.getTime() ?? 0) <= (previous.lastVisitAt?.getTime() ?? 0)) continue;
    await db.insert(atRiskAlert).values({ studioId, manaUserId: a.manaUserId, lastVisitAt: a.lastVisitAt, createdAt: now });
    created++;
  }
  const resolve = alerts.filter((a) => a.status === "open" && !awayIds.has(a.manaUserId)).map((a) => a.id);
  if (resolve.length > 0) {
    await db.update(atRiskAlert).set({ status: "resolved", handledAt: now }).where(inArray(atRiskAlert.id, resolve));
  }
  return { created, resolved: resolve.length, away: away.length };
}

export type AtRiskRow = {
  id: string;
  /** Mana may have no name for someone; the email stands in then. */
  name: string | null;
  email: string | null;
  phone: string | null;
  lastVisitAt: Date | null;
  since: Date;
  memberships: string[];
};

/** The open alerts, longest away first, with what staff need to get in touch. */
export async function listAtRisk(db: Db, studioId: string, now: Date = new Date()): Promise<AtRiskRow[]> {
  const open = await db
    .select({ alert: atRiskAlert, name: manaMember.name, email: manaMember.email, phone: manaMember.phone })
    .from(atRiskAlert)
    .innerJoin(manaMember, and(eq(manaMember.studioId, atRiskAlert.studioId), eq(manaMember.manaUserId, atRiskAlert.manaUserId)))
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.status, "open")));
  if (open.length === 0) return [];
  const ids = open.map((o) => o.alert.manaUserId);
  const [visits, memberships] = await Promise.all([
    lastVisits(db, studioId, now),
    db
      .select({ manaUserId: manaMembership.manaUserId, name: manaMembership.name, startDate: manaMembership.startDate })
      .from(manaMembership)
      .where(and(eq(manaMembership.studioId, studioId), inArray(manaMembership.manaUserId, ids), eq(manaMembership.status, "active"))),
  ]);
  const rows = open.map((o) => {
    const own = memberships.filter((m) => m.manaUserId === o.alert.manaUserId);
    const firstStart = own.map((m) => m.startDate).sort()[0];
    return {
      id: o.alert.id,
      name: o.name,
      email: o.email,
      phone: o.phone,
      lastVisitAt: visits.get(o.alert.manaUserId) ?? o.alert.lastVisitAt,
      since: firstStart ? new Date(`${firstStart}T12:00:00Z`) : o.alert.createdAt,
      memberships: [...new Set(own.map((m) => m.name))],
    };
  });
  // Longest away first: since the last visit, or since they started paying when they never came.
  const awaySince = (r: AtRiskRow) => (r.lastVisitAt ?? r.since).getTime();
  return rows.sort((a, b) => awaySince(a) - awaySince(b) || (a.name ?? "").localeCompare(b.name ?? "", "sv"));
}

export const dismissReasons = ["holiday", "injury", "other"] as const;
export type DismissReason = (typeof dismissReasons)[number];

/** Marks an open alert as handled: contacted, or dismissed with a reason. */
export async function handleAtRisk(
  db: Db,
  studioId: string,
  alertId: string,
  userId: string,
  outcome: { kind: "contacted" } | { kind: "dismissed"; reason: DismissReason },
  now: Date = new Date(),
) {
  await db
    .update(atRiskAlert)
    .set({ status: outcome.kind, reason: outcome.kind === "dismissed" ? outcome.reason : null, handledAt: now, handledById: userId })
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.id, alertId), eq(atRiskAlert.status, "open")));
}
