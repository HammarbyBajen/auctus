import { and, asc, count, eq, gt, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaMember, manaMembership, syncRun, type SyncProgress } from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/lib/leads/matching";
import type { UserMembershipsPage, UsersPage } from "./contracts";
import { describeManaError, ManaError } from "./errors";

type Db = typeof defaultDb;

/** What the sync needs from Mana. The real client satisfies it, and tests use a stand-in. */
export interface ManaSource {
  getUsersPage(nextUrl: string | null): Promise<{
    items: UsersPage["data"]["items"];
    next: string | null;
    total: number | null;
  }>;
  getUserMemberships(manaUserId: string): Promise<UserMembershipsPage["data"]["items"]>;
  lastRequestAt: number | null;
  /** Whether the key has worked in this run: a later refusal can then be Mana's request budget. */
  keyWorked?: boolean;
}

type ManaPerson = UsersPage["data"]["items"][number];
type ManaHeldMembership = UserMembershipsPage["data"]["items"][number];

/**
 * Saves people from Mana. `runId` marks who a full sync has seen. Pass
 * `keepRunId` for a single live lookup, so a person already known keeps the
 * mark from the last full sync.
 */
export async function upsertMembers(
  db: Db,
  studioId: string,
  people: ManaPerson[],
  runId: string,
  options: { keepRunId?: boolean } = {},
) {
  if (people.length === 0) return;
  await db
    .insert(manaMember)
    .values(
      people.map((u) => ({
        studioId,
        manaUserId: u.userId,
        role: u.role,
        name: u.profile.name,
        email: u.profile.email,
        emailNormalized: normalizeEmail(u.profile.email),
        phone: u.profile.phone,
        phoneNormalized: normalizePhone(u.profile.phone),
        lastRunId: runId,
        syncedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [manaMember.studioId, manaMember.manaUserId],
      set: {
        role: sql`excluded.role`,
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        emailNormalized: sql`excluded.email_normalized`,
        phone: sql`excluded.phone`,
        phoneNormalized: sql`excluded.phone_normalized`,
        ...(options.keepRunId ? {} : { lastRunId: sql`excluded.last_run_id` }),
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/**
 * The day a scheduled change takes effect: a cancellation's last day, or the
 * day a freeze starts. A freeze can also carry the day it ends, which must not
 * be mistaken for its start.
 */
export function pendingChangeDay(change: ManaHeldMembership["pendingChange"]): string | null {
  if (!change) return null;
  const day = change.kind === "freeze" ? (change.freezeDate ?? change.endDate) : (change.endDate ?? change.freezeDate);
  return day?.slice(0, 10) ?? null;
}

/** Replaces everything mirrored for one person's memberships with what Mana says now. */
export async function replaceMemberships(
  db: Db,
  studioId: string,
  manaUserId: string,
  items: ManaHeldMembership[],
) {
  await db.transaction(async (tx) => {
    await tx
      .delete(manaMembership)
      .where(and(eq(manaMembership.studioId, studioId), eq(manaMembership.manaUserId, manaUserId)));
    if (items.length > 0) {
      await tx.insert(manaMembership).values(
        items.map((m) => ({
          studioId,
          id: m.id,
          manaUserId,
          membershipId: m.membershipId,
          name: m.name,
          type: m.type,
          status: m.status,
          startDate: m.startDate.slice(0, 10),
          commitmentEndDate: m.commitmentEndDate?.slice(0, 10) ?? null,
          cancelEffectiveDate: m.cancelEffectiveDate?.slice(0, 10) ?? null,
          pendingChangeKind: m.pendingChange?.kind ?? null,
          pendingChangeDate: pendingChangeDay(m.pendingChange),
          priceAmount: m.price.amount,
          priceCurrency: m.price.currency,
          pricePeriods: (m.pricePeriods ?? []).map((p) => ({
            fromDate: p.fromDate?.slice(0, 10) ?? null,
            toDate: p.toDate?.slice(0, 10) ?? null,
            amount: p.price?.amount ?? null,
            type: p.type,
            discountPercent: p.discountPercent ?? null,
            disabled: p.disableMembership === true,
          })),
          syncedAt: new Date(),
        })),
      );
    }
  });
}

export const initialProgress: SyncProgress = {
  phase: "users",
  nextUrl: null,
  usersSeen: 0,
  usersTotal: null,
  memberCursor: null,
  membersDone: 0,
  membersTotal: null,
  lastRequestAt: null,
};

/** A run that has not moved for this long is considered dead. */
export const defaultLeaseMs = 3 * 60_000;
/** How long a run waits when Mana's request budget runs out, and how often before it gives up (2 hours). */
export const pauseMs = 15 * 60_000;
export const maxPauses = 8;

/**
 * Starts a new sync run for a studio. Only one run can be going at a time:
 * if one has moved recently, this says "busy". A run that has stopped moving
 * is marked failed and replaced.
 */
export async function startRun(
  db: Db,
  studioId: string,
  options: { now?: Date; leaseMs?: number } = {},
): Promise<{ status: "started"; runId: string } | { status: "busy"; runId: string }> {
  const now = options.now ?? new Date();
  const leaseMs = options.leaseMs ?? defaultLeaseMs;
  return db.transaction(async (tx) => {
    const [running] = await tx
      .select()
      .from(syncRun)
      .where(and(eq(syncRun.studioId, studioId), eq(syncRun.kind, "mana"), eq(syncRun.status, "running")))
      .limit(1);
    if (running) {
      // A run waiting for Mana on purpose is busy, not dead, until its wait is over.
      const movingUntil = Math.max(running.updatedAt.getTime(), running.progress.pausedUntil ?? 0);
      if (movingUntil >= now.getTime() - leaseMs) {
        return { status: "busy" as const, runId: running.id };
      }
      await tx
        .update(syncRun)
        .set({ status: "failed", finishedAt: now, error: "Synken stannade av och avbröts." })
        .where(eq(syncRun.id, running.id));
    }
    const [created] = await tx
      .insert(syncRun)
      .values({ studioId, progress: initialProgress, startedAt: now, updatedAt: now })
      .returning({ id: syncRun.id });
    return { status: "started" as const, runId: created.id };
  });
}

async function saveProgress(db: Db, runId: string, progress: SyncProgress, now: Date) {
  await db.update(syncRun).set({ progress, updatedAt: now }).where(eq(syncRun.id, runId));
}

/**
 * Notes that a run is waiting for Mana's request budget, and until when.
 * Returns that time, or null when it has waited as often as it may.
 */
export async function pauseRun(db: Db, runId: string, now: Date = new Date()): Promise<number | null> {
  const [run] = await db.select({ progress: syncRun.progress }).from(syncRun).where(eq(syncRun.id, runId)).limit(1);
  const pauses = run?.progress.pauses ?? 0;
  if (!run || pauses >= maxPauses) return null;
  const pausedUntil = now.getTime() + pauseMs;
  await saveProgress(db, runId, { ...run.progress, pausedUntil, pauses: pauses + 1 }, now);
  return pausedUntil;
}

export async function failRun(db: Db, runId: string, error: unknown) {
  await db
    .update(syncRun)
    .set({ status: "failed", finishedAt: new Date(), error: describeManaError(error) })
    .where(and(eq(syncRun.id, runId), eq(syncRun.status, "running")));
}

/**
 * Does as much of a run as fits in `budgetMs`, saving progress after every
 * request, and says whether the run is finished. Call it again to continue:
 * it picks up from the saved progress.
 *
 * 1. Read every page of people (following the next link) and mirror them.
 *    People Mana no longer returns are removed once all pages are read.
 * 2. For every person (members, staff and owners alike, since staff hold
 *    lockers and coach memberships that Mana's own reports count), read their
 *    memberships and replace the mirrored ones.
 */
export async function runBatch(
  db: Db,
  source: ManaSource,
  runId: string,
  options: { budgetMs: number; clock?: () => number },
): Promise<{ done: boolean }> {
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const outOfTime = () => clock() - startedAt >= options.budgetMs;

  const [run] = await db.select().from(syncRun).where(eq(syncRun.id, runId)).limit(1);
  if (!run) throw new ManaError("api", "Synken hittades inte.");
  if (run.status !== "running") return { done: true };
  const studioId = run.studioId;
  const progress: SyncProgress = { ...initialProgress, ...run.progress, pausedUntil: null };
  source.lastRequestAt = progress.lastRequestAt;
  // Progress is only saved after a request went through, so a saved time means the key has worked.
  source.keyWorked = source.keyWorked || progress.lastRequestAt !== null;

  const touch = () => {
    progress.lastRequestAt = source.lastRequestAt;
    return saveProgress(db, runId, progress, new Date());
  };

  // Phase 1: people
  while (progress.phase === "users") {
    if (outOfTime()) return { done: false };
    const page = await source.getUsersPage(progress.nextUrl);
    await upsertMembers(db, studioId, page.items, runId);
    progress.usersSeen += page.items.length;
    progress.usersTotal = page.total;
    progress.nextUrl = page.next;
    if (page.next === null) {
      // Every page is read: anyone Mana did not return this time is gone.
      const removed = await db
        .delete(manaMember)
        .where(and(eq(manaMember.studioId, studioId), ne(manaMember.lastRunId, runId)))
        .returning({ id: manaMember.manaUserId });
      if (removed.length > 0) {
        await db
          .delete(manaMembership)
          .where(
            and(
              eq(manaMembership.studioId, studioId),
              sql`${manaMembership.manaUserId} not in (select mana_user_id from mana_member where studio_id = ${studioId})`,
            ),
          );
      }
      const [{ n }] = await db
        .select({ n: count() })
        .from(manaMember)
        .where(eq(manaMember.studioId, studioId));
      progress.phase = "memberships";
      progress.membersTotal = n;
      progress.memberCursor = null;
      progress.membersDone = 0;
    }
    await touch();
  }

  // Phase 2: each member's memberships
  for (;;) {
    if (outOfTime()) return { done: false };
    const [next] = await db
      .select({ id: manaMember.manaUserId })
      .from(manaMember)
      .where(
        and(
          eq(manaMember.studioId, studioId),
          progress.memberCursor ? gt(manaMember.manaUserId, progress.memberCursor) : undefined,
        ),
      )
      .orderBy(asc(manaMember.manaUserId))
      .limit(1);
    if (!next) break;

    let items: Awaited<ReturnType<ManaSource["getUserMemberships"]>> = [];
    try {
      items = await source.getUserMemberships(next.id);
    } catch (error) {
      // A person removed from Mana since the list was read has no memberships to mirror.
      if (!(error instanceof ManaError && error.code === "api" && error.details.status === 404)) throw error;
    }
    await replaceMemberships(db, studioId, next.id, items);
    progress.memberCursor = next.id;
    progress.membersDone += 1;
    // A run resumed across a deploy may walk more people than its saved total.
    progress.membersTotal = Math.max(progress.membersTotal ?? 0, progress.membersDone);
    await touch();
  }

  await db
    .update(syncRun)
    .set({ status: "succeeded", finishedAt: new Date(), updatedAt: new Date(), progress })
    .where(eq(syncRun.id, runId));
  return { done: true };
}

/** Runs a sync from start to finish in one go. For tests, scripts and small studios. */
export async function runToCompletion(db: Db, source: ManaSource, studioId: string, budgetMs = 200_000) {
  const started = await startRun(db, studioId);
  if (started.status === "busy") return { status: "busy" as const, runId: started.runId };
  try {
    for (;;) {
      const { done } = await runBatch(db, source, started.runId, { budgetMs });
      if (done) return { status: "succeeded" as const, runId: started.runId };
    }
  } catch (error) {
    await failRun(db, started.runId, error);
    throw error;
  }
}
