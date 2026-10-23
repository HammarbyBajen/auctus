import { and, desc, eq, inArray, lte, max, min, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import { atRiskAlert, atRiskNote, manaMember, manaMembership, manaVisit, studioSettings, user, type AtRiskEmails } from "@/db/schema";
import type { KpiMembership } from "@/lib/kpi/members";
import { todayInStockholm } from "@/lib/tasks/dates";
import { atRiskMembers, isNewMember, visitStatuses } from "./at-risk";
import { distribute, emptyEmails, groupOf, type AtRiskGroup } from "./at-risk-work";
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

  const today = todayInStockholm(now);
  let created = 0;
  for (const a of away) {
    const previous = latestFor.get(a.manaUserId);
    if (previous?.status === "open") continue;
    // The same absence as one already handled: no new alert until they have been in again,
    // unless they were expected back by a day that has now passed.
    const sameAbsence = previous && (a.lastVisitAt?.getTime() ?? 0) <= (previous.lastVisitAt?.getTime() ?? 0);
    const backByPassed = previous?.returnBy && previous.returnBy < today;
    if (sameAbsence && !backByPassed) continue;
    await db.insert(atRiskAlert).values({ studioId, manaUserId: a.manaUserId, lastVisitAt: a.lastVisitAt, createdAt: now });
    created++;
  }
  const resolve = alerts.filter((a) => a.status === "open" && !awayIds.has(a.manaUserId)).map((a) => a.id);
  if (resolve.length > 0) {
    await db.update(atRiskAlert).set({ status: "resolved", handledAt: now }).where(inArray(atRiskAlert.id, resolve));
  }
  return { created, resolved: resolve.length, away: away.length };
}

export type AtRiskNoteRow = { kind: string; body: string; at: Date; by: string | null; private?: boolean };

export type AtRiskRow = {
  id: string;
  /** Mana may have no name for someone; the email stands in then. */
  name: string | null;
  email: string | null;
  phone: string | null;
  lastVisitAt: Date | null;
  since: Date;
  memberships: string[];
  group: AtRiskGroup;
  assignedToId: string | null;
  assigneeName: string | null;
  /** What staff did before, newest first, across earlier alerts too. */
  notes: AtRiskNoteRow[];
  /** Calls nobody answered and messages sent for this alert. */
  attempts: number;
};

/** The open alerts, longest away first, with what staff need to get in touch. */
export async function listAtRisk(db: Db, studioId: string, now: Date = new Date()): Promise<AtRiskRow[]> {
  const assignee = alias(user, "assignee");
  const open = await db
    .select({ alert: atRiskAlert, name: manaMember.name, email: manaMember.email, phone: manaMember.phone, assigneeName: assignee.name })
    .from(atRiskAlert)
    .innerJoin(manaMember, and(eq(manaMember.studioId, atRiskAlert.studioId), eq(manaMember.manaUserId, atRiskAlert.manaUserId)))
    .leftJoin(assignee, eq(assignee.id, atRiskAlert.assignedToId))
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.status, "open")));
  if (open.length === 0) return [];
  const ids = open.map((o) => o.alert.manaUserId);
  const [visits, memberships, notes, firstStarts, [dataStart]] = await Promise.all([
    lastVisits(db, studioId, now),
    db
      .select({ manaUserId: manaMembership.manaUserId, name: manaMembership.name, startDate: manaMembership.startDate })
      .from(manaMembership)
      .where(and(eq(manaMembership.studioId, studioId), inArray(manaMembership.manaUserId, ids), eq(manaMembership.status, "active"))),
    db
      .select({ manaUserId: atRiskNote.manaUserId, alertId: atRiskNote.alertId, kind: atRiskNote.kind, body: atRiskNote.body, private: atRiskNote.private, at: atRiskNote.createdAt, by: user.name })
      .from(atRiskNote)
      .leftJoin(user, eq(user.id, atRiskNote.createdById))
      .where(and(eq(atRiskNote.studioId, studioId), inArray(atRiskNote.manaUserId, ids)))
      .orderBy(desc(atRiskNote.createdAt)),
    // Whether someone is a new member (ticket 34): their first membership of any kind, and the studio's first day of data.
    db
      .select({ manaUserId: manaMembership.manaUserId, first: min(manaMembership.startDate) })
      .from(manaMembership)
      .where(and(eq(manaMembership.studioId, studioId), inArray(manaMembership.manaUserId, ids)))
      .groupBy(manaMembership.manaUserId),
    db.select({ first: min(manaMembership.startDate) }).from(manaMembership).where(eq(manaMembership.studioId, studioId)),
  ]);
  const firstStartOf = new Map(firstStarts.map((f) => [f.manaUserId, f.first]));
  const today = todayInStockholm(now);
  const rows = open.map((o) => {
    const own = memberships.filter((m) => m.manaUserId === o.alert.manaUserId);
    const firstStart = own.map((m) => m.startDate).sort()[0];
    const lastVisitAt = visits.get(o.alert.manaUserId) ?? o.alert.lastVisitAt;
    const theirs = notes.filter((n) => n.manaUserId === o.alert.manaUserId);
    return {
      id: o.alert.id,
      name: o.name,
      email: o.email,
      phone: o.phone,
      lastVisitAt,
      since: firstStart ? new Date(`${firstStart}T12:00:00Z`) : o.alert.createdAt,
      memberships: [...new Set(own.map((m) => m.name))],
      group: ((): AtRiskGroup => {
        const first = firstStartOf.get(o.alert.manaUserId);
        return first && dataStart?.first && isNewMember(first, dataStart.first, today) ? "new" : groupOf({ lastVisitAt });
      })(),
      assignedToId: o.alert.assignedToId,
      assigneeName: o.assigneeName,
      notes: theirs.map(({ kind, body, at, by, private: isPrivate }) => ({ kind, body, at, by, private: isPrivate })),
      attempts: theirs.filter((n) => n.alertId === o.alert.id && (n.kind === "no_answer" || n.kind === "messaged")).length,
    };
  });
  // Longest away first: since the last visit, or since they started paying when they never came.
  const awaySince = (r: AtRiskRow) => (r.lastVisitAt ?? r.since).getTime();
  return rows.sort((a, b) => awaySince(a) - awaySince(b) || (a.name ?? "").localeCompare(b.name ?? "", "sv"));
}

export const dismissReasons = ["holiday", "injury", "other"] as const;
export type DismissReason = (typeof dismissReasons)[number];

/** What happened when staff got in touch. Only "answered" takes them off the list; the rest are tries. */
export const contactOutcomes = ["answered", "no_answer", "messaged"] as const;
export type ContactOutcome = (typeof contactOutcomes)[number];

async function openAlert(db: Db, studioId: string, alertId: string) {
  const [alert] = await db
    .select()
    .from(atRiskAlert)
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.id, alertId), eq(atRiskAlert.status, "open")))
    .limit(1);
  return alert ?? null;
}

/**
 * Records a call, an email or a text. Answered: they are off the list (and
 * back only after a new visit and a new absence). No answer or a message
 * sent: they stay, with the try in their history.
 */
export async function logContact(db: Db, studioId: string, alertId: string, userId: string, outcome: ContactOutcome, body: string, now: Date = new Date()) {
  const alert = await openAlert(db, studioId, alertId);
  if (!alert) return false;
  await db.transaction(async (tx) => {
    await tx.insert(atRiskNote).values({ studioId, manaUserId: alert.manaUserId, alertId, kind: outcome, body: body.trim(), createdAt: now, createdById: userId });
    if (outcome === "answered") {
      await tx.update(atRiskAlert).set({ status: "contacted", handledAt: now, handledById: userId }).where(eq(atRiskAlert.id, alertId));
    }
  });
  return true;
}

/**
 * Takes a member off the list with a reason (holiday, injury, other). With a
 * back-by day they return to the list after it if they still have not been in.
 */
export async function dismissAlert(
  db: Db,
  studioId: string,
  alertId: string,
  userId: string,
  input: { reason: DismissReason; returnBy: string | null; body: string },
  now: Date = new Date(),
) {
  const alert = await openAlert(db, studioId, alertId);
  if (!alert) return false;
  await db.transaction(async (tx) => {
    await tx.insert(atRiskNote).values({ studioId, manaUserId: alert.manaUserId, alertId, kind: "dismissed", body: input.body.trim(), createdAt: now, createdById: userId });
    await tx
      .update(atRiskAlert)
      .set({ status: "dismissed", reason: input.reason, returnBy: input.returnBy, handledAt: now, handledById: userId })
      .where(eq(atRiskAlert.id, alertId));
  });
  return true;
}

/** Who gets in touch with this member; null for nobody. */
export async function assignAlert(db: Db, studioId: string, alertId: string, userId: string | null) {
  await db.update(atRiskAlert).set({ assignedToId: userId }).where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.id, alertId)));
}

/** Shares the open, unassigned members among the chosen staff, longest away first. Returns how many were shared. */
export async function distributeAlerts(db: Db, studioId: string, userIds: string[], now: Date = new Date()) {
  const unassigned = (await listAtRisk(db, studioId, now)).filter((r) => !r.assignedToId).map((r) => r.id);
  const plan = distribute(unassigned, userIds);
  await db.transaction(async (tx) => {
    for (const [alertId, userId] of plan) await tx.update(atRiskAlert).set({ assignedToId: userId }).where(eq(atRiskAlert.id, alertId));
  });
  return plan.size;
}

/** Tegen's email templates for the list (empty until Tegen has written them). */
export async function getAtRiskEmails(db: Db, studioId: string): Promise<AtRiskEmails> {
  const [row] = await db.select({ emails: studioSettings.atRiskEmails }).from(studioSettings).where(eq(studioSettings.studioId, studioId)).limit(1);
  return row?.emails ?? emptyEmails;
}

export async function saveAtRiskEmails(db: Db, studioId: string, emails: AtRiskEmails) {
  await db.update(studioSettings).set({ atRiskEmails: emails, updatedAt: new Date() }).where(eq(studioSettings.studioId, studioId));
}

/** The member behind an open alert, for emailing them from the list. */
export async function alertMember(db: Db, studioId: string, alertId: string) {
  const [row] = await db
    .select({ manaUserId: atRiskAlert.manaUserId, name: manaMember.name, email: manaMember.email, lastVisitAt: atRiskAlert.lastVisitAt })
    .from(atRiskAlert)
    .innerJoin(manaMember, and(eq(manaMember.studioId, atRiskAlert.studioId), eq(manaMember.manaUserId, atRiskAlert.manaUserId)))
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.id, alertId), eq(atRiskAlert.status, "open")))
    .limit(1);
  return row ?? null;
}
