import { asc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { coldReason, pipelineStage } from "@/db/schema";
import { defaultColdReasons, defaultStages } from "./defaults";

type Db = typeof defaultDb;

/** Gives a studio the default stages and Cold reasons if it has none yet. Safe to run twice. */
export async function ensureDefaultPipeline(db: Db, studioId: string) {
  await db
    .insert(pipelineStage)
    .values(defaultStages.map((s, position) => ({ studioId, ...s, position })))
    .onConflictDoNothing();
  await db
    .insert(coldReason)
    .values(defaultColdReasons.map((r, position) => ({ studioId, ...r, position })))
    .onConflictDoNothing();
}

export async function listStages(db: Db, studioId: string) {
  return db
    .select()
    .from(pipelineStage)
    .where(eq(pipelineStage.studioId, studioId))
    .orderBy(asc(pipelineStage.position));
}

export async function listColdReasons(db: Db, studioId: string) {
  return db
    .select()
    .from(coldReason)
    .where(eq(coldReason.studioId, studioId))
    .orderBy(asc(coldReason.position));
}
