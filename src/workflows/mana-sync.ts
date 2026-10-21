import { FatalError, sleep } from "workflow";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { describeManaError, ManaError } from "@/lib/mana/errors";
import { recordKpiSnapshot } from "@/lib/kpi/service";
import { detectAtRisk, syncVisits } from "@/lib/mana/at-risk-service";
import { afterSync } from "@/lib/mana/leads";
import { todayInStockholm } from "@/lib/tasks/dates";
import { addExtraIds, addRunRequests, failRun, holdRun, pauseRun, runBatch, startRun } from "@/lib/mana/sync";
import { and, eq, gte, sql } from "drizzle-orm";
import { manaVisit, syncRun } from "@/db/schema";
import { syncKlippkort } from "@/lib/mana/klippkort-service";
import { detectWinBacks, syncPurchases } from "@/lib/mana/winback-service";

/** How long one step may start new requests. Hobby allows 5 minutes per step, so stay well inside it. */
const STEP_BUDGET_MS = 200_000;

async function startStep(studioId: string) {
  "use step";
  const started = await startRun(db, studioId);
  return { runId: started.runId, busy: started.status === "busy" };
}

async function batchStep(studioId: string, runId: string): Promise<{ done: boolean; pausedUntil?: number }> {
  "use step";
  try {
    const client = await createManaClient(db, studioId);
    return await runBatch(db, client, runId, { budgetMs: STEP_BUDGET_MS });
  } catch (error) {
    // Mana's request budget is spent: wait it out and carry on from the saved progress.
    if (error instanceof ManaError && error.code === "rate_limited") {
      const pausedUntil = await pauseRun(db, runId);
      if (pausedUntil !== null) return { done: false, pausedUntil };
    }
    // Record why, then stop for good: retrying a refused key or a changed response would not help.
    await failRun(db, runId, error);
    throw new FatalError(describeManaError(error));
  }
}

/** When the last successful run started, for a partial run (null: a full run, which needs no signals). */
async function sinceOf(runId: string): Promise<Date | null> {
  const [run] = await db.select({ progress: syncRun.progress }).from(syncRun).where(eq(syncRun.id, runId)).limit(1);
  return run?.progress.mode === "partial" && run.progress.since ? new Date(run.progress.since) : null;
}

async function purchasesStep(studioId: string, runId: string) {
  "use step";
  // Recent day passes, clip cards and drop-ins: a few requests. A failure here
  // only means no day-pass leads today, so it does not fail the sync. Anyone
  // with a payment in any state since the last run (a new membership makes a
  // draft or pending one at once) is read in a partial run (ticket 28).
  // This step saves only at its end: keep the run from looking dead meanwhile.
  await holdRun(db, runId);
  let client: Awaited<ReturnType<typeof createManaClient>> | null = null;
  try {
    client = await createManaClient(db, studioId);
    const { payers } = await syncPurchases(db, client, studioId, new Date(), await sinceOf(runId));
    await addExtraIds(db, runId, payers);
  } catch {
    // Without the payments, a partial run cannot know who bought something: read everyone.
    await db.update(syncRun).set({ progress: sql`jsonb_set(${syncRun.progress}, '{mode}', '"full"')` }).where(eq(syncRun.id, runId));
  } finally {
    if (client) await addRunRequests(db, runId, client.requestCount);
  }
}

async function visitsStep(studioId: string, runId: string) {
  "use step";
  // Class bookings and gym check-ins since a few days before the newest saved
  // one (ticket 13). A failure only means the at-risk list is a day older, so
  // it does not fail the sync. Anyone who visited since the last run is read
  // in a partial run (ticket 28).
  // This step saves only at its end: keep the run from looking dead meanwhile.
  await holdRun(db, runId);
  let client: Awaited<ReturnType<typeof createManaClient>> | null = null;
  try {
    client = await createManaClient(db, studioId);
    await syncVisits(db, client, studioId);
    const since = await sinceOf(runId);
    if (since) {
      const visitors = await db
        .selectDistinct({ id: manaVisit.manaUserId })
        .from(manaVisit)
        .where(and(eq(manaVisit.studioId, studioId), gte(manaVisit.at, since)));
      await addExtraIds(db, runId, visitors.map((v) => v.id));
    }
  } catch {
    // The at-risk list waits a day; members with a current membership are read anyway.
  } finally {
    if (client) await addRunRequests(db, runId, client.requestCount);
  }
}

async function klippkortStep(studioId: string, runId: string) {
  "use step";
  // The studio's klippkort products, and what each holder without a membership
  // has left (ticket 31): a request plus one per holder. After the member pass,
  // so someone who just joined is not read. A failure only means no klippkort
  // tasks today, so it does not fail the sync. Its requests count on the run.
  let client: Awaited<ReturnType<typeof createManaClient>> | null = null;
  try {
    client = await createManaClient(db, studioId);
    await syncKlippkort(db, client, studioId);
  } catch {
    // Tomorrow's night reads them again.
  } finally {
    if (client) await addRunRequests(db, runId, client.requestCount);
  }
}

async function afterSyncStep(studioId: string) {
  "use step";
  // Link CRM people to Mana, move leads whose person has just joined to Won,
  // then make win-back leads (if switched on), flag members who are away, and
  // save today's key numbers.
  const won = await afterSync(db, studioId);
  const winBack = await detectWinBacks(db, studioId);
  const atRisk = await detectAtRisk(db, studioId);
  const snapshot = await recordKpiSnapshot(db, studioId, todayInStockholm());
  return { won, winBack, atRisk, snapshot: snapshot !== null };
}

/**
 * Reads members and memberships from Mana. A full pass takes several minutes
 * (one request per member, at most about one per second), so it is split into
 * steps. Each step does what fits in its time and saves its progress, and the
 * next one carries on. Most nights read only the people who can have changed
 * (a partial run, ticket 28); a full pass runs once a week. When Mana's request budget for the key is spent, the
 * run pauses for 15 minutes and carries on, for up to two hours, instead of
 * failing the night's sync.
 */
export async function manaSyncWorkflow(studioId: string) {
  "use workflow";
  const { runId, busy } = await startStep(studioId);
  if (busy) return { runId, skipped: true };
  // Visits and payments first: in a partial run they say who else to read (ticket 28).
  await visitsStep(studioId, runId);
  await purchasesStep(studioId, runId);
  let done = false;
  while (!done) {
    const batch = await batchStep(studioId, runId);
    done = batch.done;
    // A paused run costs nothing while it sleeps; it wakes and continues where it stopped.
    if (batch.pausedUntil) await sleep(new Date(batch.pausedUntil));
  }
  await klippkortStep(studioId, runId);
  const after = await afterSyncStep(studioId);
  return { runId, skipped: false, ...after };
}
