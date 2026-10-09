import { FatalError } from "workflow";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { describeManaError } from "@/lib/mana/errors";
import { afterSync } from "@/lib/mana/leads";
import { failRun, runBatch, startRun } from "@/lib/mana/sync";

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

async function afterSyncStep(studioId: string) {
  "use step";
  // Link CRM people to Mana and move leads whose person has just joined to Won.
  return afterSync(db, studioId);
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
  const won = await afterSyncStep(studioId);
  return { runId, skipped: false, won };
}
