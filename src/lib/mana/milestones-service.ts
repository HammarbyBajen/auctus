import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaMember, manaMembership, manaVisit, memberStats, milestoneHit, milestoneRule } from "@/db/schema";
import { countsOn, type KpiMembership } from "@/lib/kpi/members";
import { todayInStockholm } from "@/lib/tasks/dates";
import { visitStatuses } from "./at-risk";
import { customerRole } from "./membership";
import { crossed, defaultMilestones, milestoneKinds, weekOf, weeksInARow, type MilestoneKind } from "./milestones";

/**
 * Milstolpar (ticket 35): Mana's figures for each paying member are read a
 * few at a time each night (and again after a month), Tegen HQ counts on
 * from the visits it syncs, and a member who crosses a milestone shows on
 * Medlemmar until staff send a congratulation or skip it. Unhandled ones go
 * after 30 days.
 */

type Db = typeof defaultDb;

const DAY = 86_400_000;
/** How many members' figures are read from Mana a night (one request each; Mana's budget, ticket 28). */
const statsPerNight = 60;
/** Mana's figures are read again after this long, to correct any drift. */
const rereadAfterDays = 30;
/** An open milestone nobody acts on goes after this long. */
const keepOpenDays = 30;

// ---- Rules ----

/** The studio's milestones; a studio that has none gets the defaults. */
export async function listMilestoneRules(db: Db, studioId: string) {
  const rules = await db.select().from(milestoneRule).where(eq(milestoneRule.studioId, studioId)).orderBy(asc(milestoneRule.kind), asc(milestoneRule.threshold));
  if (rules.length > 0) return rules;
  await db
    .insert(milestoneRule)
    .values(milestoneKinds.flatMap((kind) => defaultMilestones[kind].thresholds.map((threshold) => ({ studioId, kind, threshold, subject: defaultMilestones[kind].subject, body: defaultMilestones[kind].body }))))
    .onConflictDoNothing();
  return db.select().from(milestoneRule).where(eq(milestoneRule.studioId, studioId)).orderBy(asc(milestoneRule.kind), asc(milestoneRule.threshold));
}

export class MilestoneError extends Error {
  constructor(public code: "invalid" | "exists" | "not_found") {
    super(code);
  }
}

const isKind = (value: string): value is MilestoneKind => (milestoneKinds as readonly string[]).includes(value);

export async function addMilestoneRule(db: Db, studioId: string, kind: string, threshold: number) {
  if (!isKind(kind) || !Number.isInteger(threshold) || threshold < 1 || threshold > 100_000) throw new MilestoneError("invalid");
  const [created] = await db
    .insert(milestoneRule)
    .values({ studioId, kind, threshold, subject: defaultMilestones[kind].subject, body: defaultMilestones[kind].body })
    .onConflictDoNothing()
    .returning({ id: milestoneRule.id });
  if (!created) throw new MilestoneError("exists");
}

export async function updateMilestoneRule(db: Db, studioId: string, id: string, values: { subject: string; body: string; active: boolean }) {
  const [done] = await db
    .update(milestoneRule)
    .set({ subject: values.subject.trim().slice(0, 200), body: values.body.trim().slice(0, 5000), active: values.active })
    .where(and(eq(milestoneRule.studioId, studioId), eq(milestoneRule.id, id)))
    .returning({ id: milestoneRule.id });
  if (!done) throw new MilestoneError("not_found");
}

export async function deleteMilestoneRule(db: Db, studioId: string, id: string) {
  await db.delete(milestoneRule).where(and(eq(milestoneRule.studioId, studioId), eq(milestoneRule.id, id)));
}

// ---- Mana's figures ----

/** Customers with a paying membership today. */
async function payingMembers(db: Db, studioId: string, today: string): Promise<string[]> {
  const rows = await db
    .select({ m: manaMembership })
    .from(manaMembership)
    .innerJoin(manaMember, and(eq(manaMember.studioId, manaMembership.studioId), eq(manaMember.manaUserId, manaMembership.manaUserId), eq(manaMember.role, customerRole)))
    .where(eq(manaMembership.studioId, studioId));
  return [...new Set(rows.map((r) => r.m as KpiMembership).filter((m) => countsOn(m, today)).map((m) => m.manaUserId))];
}

/**
 * Reads Mana's figures for up to 60 paying members a night: first those
 * never read, then those read longest ago, once their figures are a month old.
 */
export async function syncMemberStats(
  db: Db,
  source: { getUserStats(manaUserId: string): Promise<{ classesTotal: number; streakWeeks: number }> },
  studioId: string,
  now: Date = new Date(),
): Promise<{ read: number }> {
  const members = await payingMembers(db, studioId, todayInStockholm(now));
  if (members.length === 0) return { read: 0 };
  const known = new Map(
    (await db.select({ manaUserId: memberStats.manaUserId, readAt: memberStats.readAt }).from(memberStats).where(and(eq(memberStats.studioId, studioId), inArray(memberStats.manaUserId, members)))).map((s) => [s.manaUserId, s.readAt]),
  );
  const stale = now.getTime() - rereadAfterDays * DAY;
  const due = members
    .filter((id) => !known.has(id) || known.get(id)!.getTime() < stale)
    .sort((a, b) => (known.get(a)?.getTime() ?? 0) - (known.get(b)?.getTime() ?? 0))
    .slice(0, statsPerNight);
  for (const manaUserId of due) {
    const stats = await source.getUserStats(manaUserId);
    const base = { baseClasses: stats.classesTotal, baseStreak: stats.streakWeeks, readAt: now };
    await db
      .insert(memberStats)
      .values({ studioId, manaUserId, ...base })
      .onConflictDoUpdate({ target: [memberStats.studioId, memberStats.manaUserId], set: base });
  }
  return { read: due.length };
}

// ---- Finding milestones ----

/**
 * Works out each paying member's classes in total and weeks in a row (Mana's
 * figure plus the classes since), and records the milestones crossed since the
 * last check. The first check of a member only notes their figures.
 */
export async function detectMilestones(db: Db, studioId: string, now: Date = new Date()) {
  const today = todayInStockholm(now);
  // Nobody acted for 30 days: the moment has passed.
  await db
    .update(milestoneHit)
    .set({ status: "expired" })
    .where(and(eq(milestoneHit.studioId, studioId), eq(milestoneHit.status, "open"), lte(milestoneHit.createdAt, new Date(now.getTime() - keepOpenDays * DAY))));

  const rules = (await listMilestoneRules(db, studioId)).filter((r) => r.active);
  const members = await payingMembers(db, studioId, today);
  if (members.length === 0) return { checked: 0, reached: 0 };
  const stats = await db.select().from(memberStats).where(and(eq(memberStats.studioId, studioId), inArray(memberStats.manaUserId, members)));
  if (stats.length === 0) return { checked: 0, reached: 0 };

  // Visits since the earliest read, back to the week it was read in (for weeks in a row).
  // Mana counts classes and gym check-ins alike, so a visit here is what it is on the at-risk list.
  const earliest = new Date(Math.min(...stats.map((s) => s.readAt.getTime())) - 7 * DAY);
  const visits = await db
    .select({ manaUserId: manaVisit.manaUserId, at: manaVisit.at })
    .from(manaVisit)
    .where(
      and(
        eq(manaVisit.studioId, studioId),
        or(eq(manaVisit.kind, "gym"), inArray(manaVisit.status, [...visitStatuses])),
        inArray(manaVisit.manaUserId, stats.map((s) => s.manaUserId)),
        gte(manaVisit.at, earliest),
        lte(manaVisit.at, now),
      ),
    );
  const byMember = new Map<string, Date[]>();
  for (const v of visits) byMember.set(v.manaUserId, [...(byMember.get(v.manaUserId) ?? []), v.at]);

  const thresholds = (kind: MilestoneKind) => rules.filter((r) => r.kind === kind).map((r) => r.threshold);
  let reached = 0;
  for (const s of stats) {
    const own = byMember.get(s.manaUserId) ?? [];
    const classes = s.baseClasses + own.filter((at) => at > s.readAt).length;
    const readWeek = weekOf(todayInStockholm(s.readAt));
    const readWeekCounted = own.some((at) => at <= s.readAt && weekOf(todayInStockholm(at)) === readWeek);
    const streak = weeksInARow(own.map((at) => todayInStockholm(at)), today, { streak: s.baseStreak, readOn: todayInStockholm(s.readAt), readWeekCounted });
    const hits = [
      ...crossed(s.lastClasses, classes, thresholds("classes_total")).map((threshold) => ({ kind: "classes_total", threshold })),
      ...crossed(s.lastStreak, streak, thresholds("weeks_in_a_row")).map((threshold) => ({ kind: "weeks_in_a_row", threshold })),
    ];
    if (hits.length > 0) {
      const created = await db
        .insert(milestoneHit)
        .values(hits.map((h) => ({ studioId, manaUserId: s.manaUserId, ...h, reachedOn: today, createdAt: now })))
        .onConflictDoNothing()
        .returning({ id: milestoneHit.id });
      reached += created.length;
    }
    await db
      .update(memberStats)
      .set({ lastClasses: classes, lastStreak: streak, checkedAt: now })
      .where(and(eq(memberStats.studioId, studioId), eq(memberStats.manaUserId, s.manaUserId)));
  }
  return { checked: stats.length, reached };
}

// ---- The list on Medlemmar ----

export type MilestoneRow = {
  id: string;
  manaUserId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  kind: MilestoneKind;
  threshold: number;
  reachedOn: string;
  memberships: string[];
  template: { subject: string; body: string };
};

/** The open milestones, newest first, with the message the owners wrote for each. */
export async function listMilestones(db: Db, studioId: string): Promise<MilestoneRow[]> {
  const rows = await db
    .select({ hit: milestoneHit, name: manaMember.name, email: manaMember.email, phone: manaMember.phone })
    .from(milestoneHit)
    .innerJoin(manaMember, and(eq(manaMember.studioId, milestoneHit.studioId), eq(manaMember.manaUserId, milestoneHit.manaUserId)))
    .where(and(eq(milestoneHit.studioId, studioId), eq(milestoneHit.status, "open")))
    .orderBy(sql`${milestoneHit.reachedOn} desc`, asc(manaMember.name));
  if (rows.length === 0) return [];
  const [rules, memberships] = await Promise.all([
    db.select().from(milestoneRule).where(eq(milestoneRule.studioId, studioId)),
    db
      .select({ manaUserId: manaMembership.manaUserId, name: manaMembership.name })
      .from(manaMembership)
      .where(and(eq(manaMembership.studioId, studioId), inArray(manaMembership.manaUserId, rows.map((r) => r.hit.manaUserId)), eq(manaMembership.status, "active"))),
  ]);
  return rows.map(({ hit, name, email, phone }) => {
    const rule = rules.find((r) => r.kind === hit.kind && r.threshold === hit.threshold);
    const kind = hit.kind as MilestoneKind;
    return {
      id: hit.id,
      manaUserId: hit.manaUserId,
      name,
      email,
      phone,
      kind,
      threshold: hit.threshold,
      reachedOn: hit.reachedOn,
      memberships: [...new Set(memberships.filter((m) => m.manaUserId === hit.manaUserId).map((m) => m.name))],
      template: { subject: rule?.subject ?? defaultMilestones[kind].subject, body: rule?.body ?? defaultMilestones[kind].body },
    };
  });
}

/** How many milestones wait for staff, for Home's summary. */
export async function countOpenMilestones(db: Db, studioId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(milestoneHit).where(and(eq(milestoneHit.studioId, studioId), eq(milestoneHit.status, "open")));
  return row?.n ?? 0;
}

/** Staff sent a congratulation, or decided to skip this one. */
export async function handleMilestone(db: Db, studioId: string, id: string, status: "done" | "skipped", userId: string, now: Date = new Date()) {
  await db
    .update(milestoneHit)
    .set({ status, handledAt: now, handledById: userId })
    .where(and(eq(milestoneHit.studioId, studioId), eq(milestoneHit.id, id), eq(milestoneHit.status, "open")));
}

/** The member behind an open milestone, to write to. */
export async function milestoneMember(db: Db, studioId: string, id: string) {
  const [row] = await db
    .select({ manaUserId: milestoneHit.manaUserId, kind: milestoneHit.kind, threshold: milestoneHit.threshold, name: manaMember.name, email: manaMember.email })
    .from(milestoneHit)
    .innerJoin(manaMember, and(eq(manaMember.studioId, milestoneHit.studioId), eq(manaMember.manaUserId, milestoneHit.manaUserId)))
    .where(and(eq(milestoneHit.studioId, studioId), eq(milestoneHit.id, id), eq(milestoneHit.status, "open")))
    .limit(1);
  return row ?? null;
}

/** Everything kept about a member's milestones, removed with their other data (privacy, ticket 17). */
export async function forgetMemberMilestones(db: Db, studioId: string, manaUserId: string) {
  await db.delete(milestoneHit).where(and(eq(milestoneHit.studioId, studioId), eq(milestoneHit.manaUserId, manaUserId)));
  await db.delete(memberStats).where(and(eq(memberStats.studioId, studioId), eq(memberStats.manaUserId, manaUserId)));
}
