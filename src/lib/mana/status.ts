import { and, count, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaMember, manaMembership, studioSettings, syncRun, type SyncProgress } from "@/db/schema";

type Db = typeof defaultDb;

export type SyncStatus = {
  configured: boolean;
  lastSuccessAt: Date | null;
  running: { phase: SyncProgress["phase"]; done: number; total: number | null; pausedUntil: Date | null } | null;
  /** The latest failure, only when it is newer than the last success. */
  failure: { at: Date; error: string } | null;
  members: number;
  memberships: number;
  recentRuns: { id: string; status: string; startedAt: Date; finishedAt: Date | null; error: string | null }[];
};

export async function getSyncStatus(db: Db, studioId: string): Promise<SyncStatus> {
  const [settings] = await db
    .select({ manaStudioId: studioSettings.manaStudioId })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  const runs = await db
    .select()
    .from(syncRun)
    .where(and(eq(syncRun.studioId, studioId), eq(syncRun.kind, "mana")))
    .orderBy(desc(syncRun.startedAt))
    .limit(8);
  const [[members], [memberships]] = await Promise.all([
    db.select({ n: count() }).from(manaMember).where(eq(manaMember.studioId, studioId)),
    db.select({ n: count() }).from(manaMembership).where(eq(manaMembership.studioId, studioId)),
  ]);

  const lastSuccess = runs.find((r) => r.status === "succeeded");
  const lastFailure = runs.find((r) => r.status === "failed");
  const runningRun = runs.find((r) => r.status === "running");
  const failureIsNewer =
    lastFailure && (!lastSuccess || (lastFailure.finishedAt ?? lastFailure.startedAt) > (lastSuccess.finishedAt ?? lastSuccess.startedAt));

  return {
    configured: Boolean(settings?.manaStudioId),
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    running: runningRun
      ? {
          phase: runningRun.progress.phase,
          done: runningRun.progress.phase === "users" ? runningRun.progress.usersSeen : runningRun.progress.membersDone,
          total: runningRun.progress.phase === "users" ? runningRun.progress.usersTotal : runningRun.progress.membersTotal,
          pausedUntil: runningRun.progress.pausedUntil ? new Date(runningRun.progress.pausedUntil) : null,
        }
      : null,
    failure: failureIsNewer && lastFailure ? { at: lastFailure.finishedAt ?? lastFailure.startedAt, error: lastFailure.error ?? "" } : null,
    members: members.n,
    memberships: memberships.n,
    recentRuns: runs.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      error: r.error,
    })),
  };
}

export type Banner =
  | { tone: "red"; kind: "failed"; error: string }
  | { tone: "amber"; kind: "never" }
  | { tone: "amber"; kind: "stale"; since: Date }
  | { tone: "info"; kind: "running"; done: number; total: number | null };

/** How old the last good sync may get before the page warns. A daily sync plus some slack. */
export const staleAfterMs = 36 * 3_600_000;

/** Decides whether to warn about the Mana sync. Null means all is well, or Mana is not used. */
export function bannerFor(status: SyncStatus, now: Date): Banner | null {
  if (!status.configured) return null;
  if (status.failure) return { tone: "red", kind: "failed", error: status.failure.error };
  if (status.running) return { tone: "info", kind: "running", done: status.running.done, total: status.running.total };
  if (!status.lastSuccessAt) return { tone: "amber", kind: "never" };
  if (now.getTime() - status.lastSuccessAt.getTime() > staleAfterMs) {
    return { tone: "amber", kind: "stale", since: status.lastSuccessAt };
  }
  return null;
}
