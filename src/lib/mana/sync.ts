import { and, asc, count, desc, eq, exists, gt, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaMember, manaMembership, syncRun, type SyncProgress } from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/lib/leads/matching";
import type { UserMembershipsPage, UsersPage } from "./contracts";
import { describeManaError, ManaError } from "./errors";
import { todayInStockholm } from "@/lib/tasks/dates";

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
  /** Requests made so far, so a run can record how many it used. */
  requestCount?: number;
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

const DAY_MS = 86_400_000;

/** ISO weekday (1 = Monday) of a YYYY-MM-DD day. */
const isoWeekday = (day: string) => ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/**
 * Full or partial (ticket 28). A full pass reads every person's memberships; a
 * partial one only those who can have changed. Full when nothing has
 * succeeded yet, when the last full pass is a week old, and on the night
 * between Sunday and Monday (the nightly run is early Monday in Stockholm),
 * once that day.
 */
export function syncModeFor(input: { today: string; lastSuccessAt: Date | null; lastFull: { startedAt: Date; day: string } | null; now: Date }): "full" | "partial" {
  const { today, lastSuccessAt, lastFull, now } = input;
  if (!lastSuccessAt || !lastFull) return "full";
  if (now.getTime() - lastFull.startedAt.getTime() >= 7 * DAY_MS) return "full";
  if (isoWeekday(today) === 1 && lastFull.day !== today) return "full";
  return "partial";
}

/**
 * Starts a new sync run for a studio. Only one run can be going at a time:
 * if one has moved recently, this says "busy". A run that has stopped moving
 * is marked failed and replaced. The run is full or partial (`syncModeFor`)
 * unless a mode is given.
 */
export async function startRun(
  db: Db,
  studioId: string,
  options: { now?: Date; leaseMs?: number; mode?: "full" | "partial" } = {},
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
    const succeeded = and(eq(syncRun.studioId, studioId), eq(syncRun.kind, "mana"), eq(syncRun.status, "succeeded"));
    const [lastSuccess] = await tx.select({ startedAt: syncRun.startedAt }).from(syncRun).where(succeeded).orderBy(desc(syncRun.startedAt)).limit(1);
    // Runs from before ticket 28 have no mode and were full.
    const [lastFull] = await tx
      .select({ startedAt: syncRun.startedAt })
      .from(syncRun)
      .where(and(succeeded, sql`coalesce(${syncRun.progress}->>'mode', 'full') = 'full'`))
      .orderBy(desc(syncRun.startedAt))
      .limit(1);
    const mode =
      options.mode ??
      syncModeFor({
        today: todayInStockholm(now),
        lastSuccessAt: lastSuccess?.startedAt ?? null,
        lastFull: lastFull ? { startedAt: lastFull.startedAt, day: todayInStockholm(lastFull.startedAt) } : null,
        now,
      });
    const progress: SyncProgress = { ...initialProgress, mode, since: mode === "partial" ? (lastSuccess?.startedAt.getTime() ?? null) : null, extraIds: [], requests: 0 };
    const [created] = await tx
      .insert(syncRun)
      .values({ studioId, progress, startedAt: now, updatedAt: now })
      .returning({ id: syncRun.id });
    return { status: "started" as const, runId: created.id };
  });
}

async function saveProgress(db: Db, runId: string, progress: SyncProgress, now: Date) {
  await db.update(syncRun).set({ progress, updatedAt: now }).where(eq(syncRun.id, runId));
}

/** Adds people a partial run should read too (paid or visited since the last run). */
export async function addExtraIds(db: Db, runId: string, ids: string[]) {
  if (ids.length === 0) return;
  const [run] = await db.select({ progress: syncRun.progress }).from(syncRun).where(eq(syncRun.id, runId)).limit(1);
  if (!run) return;
  const extraIds = [...new Set([...(run.progress.extraIds ?? []), ...ids])];
  await db.update(syncRun).set({ progress: { ...run.progress, extraIds } }).where(eq(syncRun.id, runId));
}

/** Adds requests made outside the member pass (visits, payments) to the run's count. */
export async function addRunRequests(db: Db, runId: string, n: number) {
  if (n <= 0) return;
  await db
    .update(syncRun)
    .set({ progress: sql`jsonb_set(${syncRun.progress}, '{requests}', to_jsonb(coalesce((${syncRun.progress}->>'requests')::int, 0) + ${n}))` })
    .where(eq(syncRun.id, runId));
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
 *    memberships and replace the mirrored ones. A partial run (ticket 28) reads
 *    only people with a current membership (a cancellation or a freeze is not
 *    a payment, so it can come any day), new people, and the ones in
 *    `extraIds` (paid or visited since the last run). Anyone else can only
 *    change by buying something, which shows up as a payment first.
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
  const requestsBefore = progress.requests ?? 0;
  const countBefore = source.requestCount ?? 0;
  const partial = progress.mode === "partial";

  const touch = () => {
    progress.lastRequestAt = source.lastRequestAt;
    progress.requests = requestsBefore + (source.requestCount ?? 0) - countBefore;
    return saveProgress(db, runId, progress, new Date());
  };
  // Who a partial run reads in phase 2; a full run reads everyone.
  const selected = (): SQL | undefined =>
    partial
      ? or(
          exists(
            db
              .select({ one: sql`1` })
              .from(manaMembership)
              .where(
                and(
                  eq(manaMembership.studioId, studioId),
                  eq(manaMembership.manaUserId, manaMember.manaUserId),
                  inArray(manaMembership.status, ["active", "future"]),
                ),
              ),
          ),
          progress.extraIds?.length ? inArray(manaMember.manaUserId, progress.extraIds) : undefined,
        )
      : undefined;

  // Phase 1: people
  while (progress.phase === "users") {
    if (outOfTime()) return { done: false };
    const page = await source.getUsersPage(progress.nextUrl);
    if (partial && page.items.length > 0) {
      // Someone Mana returns for the first time is read in full, whatever the mode.
      const ids = page.items.map((u) => u.userId);
      const known = new Set(
        (await db.select({ id: manaMember.manaUserId }).from(manaMember).where(and(eq(manaMember.studioId, studioId), inArray(manaMember.manaUserId, ids)))).map((r) => r.id),
      );
      const fresh = ids.filter((id) => !known.has(id));
      if (fresh.length > 0) progress.extraIds = [...new Set([...(progress.extraIds ?? []), ...fresh])];
    }
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
        .where(and(eq(manaMember.studioId, studioId), selected()));
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
          selected(),
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
