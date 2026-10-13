import { FatalError } from "workflow";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { describeManaError } from "@/lib/mana/errors";
import { recordKpiSnapshot } from "@/lib/kpi/service";
import { detectAtRisk, syncVisits } from "@/lib/mana/at-risk-service";
import { afterSync } from "@/lib/mana/leads";
import { todayInStockholm } from "@/lib/tasks/dates";
import { failRun, runBatch, startRun } from "@/lib/mana/sync";
import { detectWinBacks, syncPurchases } from "@/lib/mana/winback-service";

/** How long one step may start new requests. Hobby allows 5 minutes per step, so stay well inside it. */
const STEP_BUDGET_MS = 200_000;

async function startStep(studioId: string) {
  "use step";
  const started = await startRun(db, studioId);
  return { runId: started.runId, busy: started.status === "busy" };
}

async function batchStep(studioId: string, runId: string) {
  "use step";
  try {
    const client = await createManaClient(db, studioId);
    const { done } = await runBatch(db, client, runId, { budgetMs: STEP_BUDGET_MS });
    return done;
  } catch (error) {
    // Record why, then stop for good: retrying a refused key or a changed response would not help.
    await failRun(db, runId, error);
    throw new FatalError(describeManaError(error));
  }
}

async function purchasesStep(studioId: string) {
  "use step";
  // Recent day passes, clip cards and drop-ins: a few requests. A failure here
  // only means no day-pass leads today, so it does not fail the sync.
  try {
    const client = await createManaClient(db, studioId);
    return await syncPurchases(db, client, studioId);
  } catch {
    return 0;
  }
}

async function visitsStep(studioId: string) {
  "use step";
  // Class bookings and gym check-ins since a few days before the newest saved
  // one (ticket 13). A failure only means the at-risk list is a day older, so
  // it does not fail the sync.
  try {
    const client = await createManaClient(db, studioId);
    return await syncVisits(db, client, studioId);
  } catch {
    return null;
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
 * next one carries on.
 */
export async function manaSyncWorkflow(studioId: string) {
  "use workflow";
  const { runId, busy } = await startStep(studioId);
  if (busy) return { runId, skipped: true };
  let done = false;
  while (!done) {
    done = await batchStep(studioId, runId);
  }
  await purchasesStep(studioId);
  await visitsStep(studioId);
  const after = await afterSyncStep(studioId);
  return { runId, skipped: false, ...after };
}
