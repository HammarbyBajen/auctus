import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { salaryInstructor, salaryLog, salaryMonth, salaryTypeRule, salaryWork, user } from "@/db/schema";
import { ManaError } from "@/lib/mana/errors";
import { t } from "@/lib/i18n";
import { calculateMonth, pullWindow, type MonthResult, type Work } from "./calc";

type Db = typeof defaultDb;

/** What the pull needs from Mana (the read-only client has all of it). */
export type SalarySource = {
  getInstructors(): Promise<{ id: string; name: string }[]>;
  getClassEvents(fromAt: string, toAt: string): Promise<{ id: string; class: { id: string; title: string }; startsAt: string; endsAt: string; instructorId: string | null; isHidden?: boolean }[]>;
  getServiceBookings(fromAt: string, toAt: string): Promise<{ id: string; specialistServiceId: string; instructorId: string | null; startsAt: string; endsAt: string; status: string }[]>;
  getSpecialistServices(): Promise<{ id: string; name: string }[]>;
  getCourses(fromAt: string, toAt: string): Promise<{ id: string; name: string }[]>;
  getCourseEvents(courseId: string): Promise<{ id: string; startsAt: string; endsAt: string; instructorId: string | null }[]>;
};

/** A month a pull is older than this is refreshed before it is locked. */
export const staleAfterMs = 60 * 60_000;

/** Months pulled while moving off the old routine, kept only for checking (ticket 23). */
export const testMonths = new Set(["2026-09"]);

export const isMonth = (value: string | undefined | null): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

/**
 * Group classes for a window. Mana refuses a window that is too long or has
 * more than 200 classes (400 or 413), so such a window is halved until it fits.
 */
async function classEventsIn(source: SalarySource, from: Date, to: Date, depth = 0): ReturnType<SalarySource["getClassEvents"]> {
  try {
    return await source.getClassEvents(from.toISOString(), to.toISOString());
  } catch (error) {
    const tooBig = error instanceof ManaError && (error.details.status === 400 || error.details.status === 413);
    if (!tooBig || depth >= 6) throw error;
    const middle = new Date(Math.floor((from.getTime() + to.getTime()) / 2));
    return [...(await classEventsIn(source, from, middle, depth + 1)), ...(await classEventsIn(source, middle, to, depth + 1))];
  }
}

/**
 * Pulls a month's coach work from Mana (ticket 20): group classes, PT and
 * Onramp bookings and Kids course sessions, in the month (Tegen's time).
 * Replaces what was pulled before, so a class removed in Mana goes
 * away here too. A new category counts until an owner leaves it out, hidden
 * classes (Tegenbutik, NSI, PT60...) too (Max, 2026-10-27: everything ticked,
 * owners untick what should not count). A locked month is never pulled.
 */
export async function pullMonth(db: Db, source: SalarySource, studioId: string, month: string, userId: string | null, now: Date = new Date()) {
  const [current] = await db.select().from(salaryMonth).where(and(eq(salaryMonth.studioId, studioId), eq(salaryMonth.month, month))).limit(1);
  if (current?.lockedAt) return { status: "locked" as const };

  const window = pullWindow(month);
  const fromAt = window.from.toISOString();
  const toAt = window.to.toISOString();
  const inWindow = (startsAt: Date) => startsAt >= window.from && startsAt < window.to;

  const instructors = await source.getInstructors();
  const services = new Map((await source.getSpecialistServices()).map((s) => [s.id, s.name]));
  const classEvents = [];
  for (const week of window.weeks) classEvents.push(...(await classEventsIn(source, week.from, week.to)));
  const bookings = await source.getServiceBookings(fromAt, toAt);
  const courses = await source.getCourses(fromAt, toAt);
  const courseEvents: { course: { id: string; name: string }; event: Awaited<ReturnType<SalarySource["getCourseEvents"]>>[number] }[] = [];
  for (const course of courses) {
    for (const event of await source.getCourseEvents(course.id)) courseEvents.push({ course, event });
  }

  const work = new Map<string, Work>();
  // Hidden classes (ticket 23) are categories of their own, marked (dold): some, such as PT60, may be the same sessions as PT bookings.
  for (const e of classEvents) {
    work.set(`class:${e.id}`, {
      id: `class:${e.id}`,
      source: "class",
      typeKey: `class:${e.class.id}`,
      typeLabel: e.isHidden ? t("salary.hiddenLabel", { name: e.class.title }) : e.class.title,
      instructorId: e.instructorId,
      startsAt: new Date(e.startsAt),
      endsAt: new Date(e.endsAt),
      status: null,
    });
  }
  for (const b of bookings) {
    work.set(`service:${b.id}`, {
      id: `service:${b.id}`,
      source: "service",
      typeKey: `service:${b.specialistServiceId}`,
      typeLabel: services.get(b.specialistServiceId) ?? "PT",
      instructorId: b.instructorId,
      startsAt: new Date(b.startsAt),
      endsAt: new Date(b.endsAt),
      status: b.status,
    });
  }
  for (const { course, event } of courseEvents) {
    work.set(`course:${event.id}`, {
      id: `course:${event.id}`,
      source: "course",
      typeKey: `course:${course.id}`,
      typeLabel: course.name,
      instructorId: event.instructorId,
      startsAt: new Date(event.startsAt),
      endsAt: new Date(event.endsAt),
      status: null,
    });
  }
  const rows = [...work.values()].filter((w) => inWindow(w.startsAt)).map((w) => ({ studioId, month, ...w }));

  const types = new Map<string, { typeKey: string; label: string; source: string }>();
  for (const w of rows) types.set(w.typeKey, { typeKey: w.typeKey, label: w.typeLabel, source: w.source });

  await db.transaction(async (tx) => {
    await tx.delete(salaryWork).where(and(eq(salaryWork.studioId, studioId), eq(salaryWork.month, month)));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(salaryWork).values(rows.slice(i, i + 500));
    if (instructors.length > 0) {
      await tx
        .insert(salaryInstructor)
        .values(instructors.map((i) => ({ studioId, id: i.id, name: i.name, seenAt: now })))
        .onConflictDoUpdate({ target: [salaryInstructor.studioId, salaryInstructor.id], set: { name: sql`excluded.name`, seenAt: now } });
    }
    if (types.size > 0) {
      // A new category counts; a known one keeps its choice and only gets its current name.
      await tx
        .insert(salaryTypeRule)
        .values([...types.values()].map((type) => ({ studioId, ...type, counted: true })))
        .onConflictDoUpdate({ target: [salaryTypeRule.studioId, salaryTypeRule.typeKey], set: { label: sql`excluded.label` } });
    }
    await tx
      .insert(salaryMonth)
      .values({ studioId, month, pulledAt: now, pulledById: userId })
      .onConflictDoUpdate({ target: [salaryMonth.studioId, salaryMonth.month], set: { pulledAt: now, pulledById: userId } });
  });

  return { status: "pulled" as const, sessions: rows.length, newTypes: types.size };
}

// ---- Coaches ----

/** The coaches: Mana's instructors as of the latest pull. */
export async function listCoaches(db: Db, studioId: string) {
  return db.select({ id: salaryInstructor.id, name: salaryInstructor.name }).from(salaryInstructor).where(eq(salaryInstructor.studioId, studioId)).orderBy(asc(salaryInstructor.name));
}

// ---- Categories ----

export async function listCategories(db: Db, studioId: string) {
  return db.select().from(salaryTypeRule).where(eq(salaryTypeRule.studioId, studioId)).orderBy(asc(salaryTypeRule.source), asc(salaryTypeRule.label));
}

/** Which categories count: the ones listed in `counted` do, every other one the month has is left out. */
export async function setCounted(db: Db, studioId: string, typeKeys: string[], counted: string[]) {
  const keep = new Set(counted);
  await db.transaction(async (tx) => {
    for (const typeKey of typeKeys) {
      await tx.update(salaryTypeRule).set({ counted: keep.has(typeKey) }).where(and(eq(salaryTypeRule.studioId, studioId), eq(salaryTypeRule.typeKey, typeKey)));
    }
  });
}

// ---- Months ----

export type LockedSnapshot = MonthResult & { lockedAt: string };

/** The month's figures: the frozen ones if it is locked, otherwise calculated from what was pulled with today's choice of categories. */
export async function getMonth(db: Db, studioId: string, month: string, now: Date = new Date()) {
  const [state] = await db
    .select({
      pulledAt: salaryMonth.pulledAt,
      lockedAt: salaryMonth.lockedAt,
      lockedBy: user.name,
      snapshot: salaryMonth.snapshot,
    })
    .from(salaryMonth)
    .leftJoin(user, eq(user.id, salaryMonth.lockedById))
    .where(and(eq(salaryMonth.studioId, studioId), eq(salaryMonth.month, month)))
    .limit(1);
  if (state?.lockedAt && state.snapshot) {
    return { pulledAt: state.pulledAt, stale: false, lockedAt: state.lockedAt, lockedBy: state.lockedBy, result: state.snapshot as LockedSnapshot };
  }
  if (!state?.pulledAt) return { pulledAt: null, stale: true, lockedAt: null, lockedBy: null, result: null };
  // Locking an old pull refreshes it first.
  const stale = now.getTime() - state.pulledAt.getTime() > staleAfterMs;
  return { pulledAt: state.pulledAt, stale, lockedAt: null, lockedBy: null, result: await calculate(db, studioId, month) };
}

async function calculate(db: Db, studioId: string, month: string): Promise<MonthResult> {
  const [work, coaches, categories] = await Promise.all([
    db.select().from(salaryWork).where(and(eq(salaryWork.studioId, studioId), eq(salaryWork.month, month))),
    listCoaches(db, studioId),
    listCategories(db, studioId),
  ]);
  return calculateMonth({ month, work: work.map((w) => ({ ...w, source: w.source as Work["source"] })), coaches, categories });
}

/** The months that have been pulled, newest first. */
export async function listMonths(db: Db, studioId: string) {
  return db
    .select({ month: salaryMonth.month, pulledAt: salaryMonth.pulledAt, lockedAt: salaryMonth.lockedAt })
    .from(salaryMonth)
    .where(eq(salaryMonth.studioId, studioId))
    .orderBy(desc(salaryMonth.month));
}

/**
 * Locks a month (ticket 23): its figures are frozen as they are now, so later
 * changes to the categories or Mana do not move them. Refuses a month whose
 * pull is older than `staleAfterMs`, so the caller refreshes it first.
 */
export async function lockMonth(db: Db, studioId: string, month: string, userId: string, now: Date = new Date()) {
  const [state] = await db.select().from(salaryMonth).where(and(eq(salaryMonth.studioId, studioId), eq(salaryMonth.month, month))).limit(1);
  if (!state?.pulledAt) return { status: "not_pulled" as const };
  if (state.lockedAt) return { status: "locked" as const };
  if (now.getTime() - state.pulledAt.getTime() > staleAfterMs) return { status: "stale" as const };
  const snapshot: LockedSnapshot = { ...(await calculate(db, studioId, month)), lockedAt: now.toISOString() };
  await db.transaction(async (tx) => {
    await tx.update(salaryMonth).set({ lockedAt: now, lockedById: userId, snapshot }).where(and(eq(salaryMonth.studioId, studioId), eq(salaryMonth.month, month)));
    await tx.insert(salaryLog).values({ studioId, month, action: "lock", at: now, byId: userId });
  });
  return { status: "locked_now" as const };
}

/** Unlocks a month (owners only, checked by the caller), and records who did. */
export async function unlockMonth(db: Db, studioId: string, month: string, userId: string, now: Date = new Date()) {
  await db.transaction(async (tx) => {
    await tx.update(salaryMonth).set({ lockedAt: null, lockedById: null, snapshot: null }).where(and(eq(salaryMonth.studioId, studioId), eq(salaryMonth.month, month)));
    await tx.insert(salaryLog).values({ studioId, month, action: "unlock", at: now, byId: userId });
  });
}

export async function monthLog(db: Db, studioId: string, month: string) {
  return db
    .select({ action: salaryLog.action, at: salaryLog.at, by: user.name })
    .from(salaryLog)
    .leftJoin(user, eq(user.id, salaryLog.byId))
    .where(and(eq(salaryLog.studioId, studioId), eq(salaryLog.month, month)))
    .orderBy(desc(salaryLog.at));
}
