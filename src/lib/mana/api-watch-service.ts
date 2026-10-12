import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { manaApiCheck, manaApiSpec } from "@/db/schema";
import { diffSpecs, specHash, specLines, specUrl, type SpecChanges } from "./api-watch";
import { fetchManaSpec } from "./client";

type Db = typeof defaultDb;

export type WatchResult =
  | { kind: "failed"; error: string }
  | { kind: "baseline" }
  | { kind: "unchanged" }
  | { kind: "changed"; changes: SpecChanges | null };

/** Checks without changes are only kept this long; failures and changes are kept. */
const keepQuietChecksDays = 30;

/**
 * Reads Mana's spec, compares it with the last copy and records the check. The
 * first run only saves a copy to compare against. A new copy is saved whenever
 * the content changes, but only a change to endpoints, parameters or fields
 * (not wording) is recorded as one to look at. A failure to read is recorded too.
 */
export async function runApiWatch(
  db: Db,
  read: () => Promise<unknown> = () => fetchManaSpec(specUrl),
  now: Date = new Date(),
): Promise<WatchResult> {
  let spec: unknown;
  let hash: string;
  try {
    spec = await read();
    specLines(spec); // throws when it is not an OpenAPI spec at all
    hash = specHash(spec);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.insert(manaApiCheck).values({ checkedAt: now, ok: false, error: message });
    return { kind: "failed", error: message };
  }

  const [previous] = await db.select().from(manaApiSpec).orderBy(desc(manaApiSpec.fetchedAt)).limit(1);
  let result: WatchResult;
  if (!previous) {
    await db.insert(manaApiSpec).values({ hash, spec, fetchedAt: now });
    result = { kind: "baseline" };
  } else if (previous.hash === hash) {
    result = { kind: "unchanged" };
  } else {
    const changes = diffSpecs(previous.spec, spec);
    await db.insert(manaApiSpec).values({ hash, spec, fetchedAt: now }).onConflictDoUpdate({ target: manaApiSpec.hash, set: { fetchedAt: now } });
    result = { kind: "changed", changes };
  }
  const changes = result.kind === "changed" ? result.changes : null;
  await db.insert(manaApiCheck).values({ checkedAt: now, ok: true, hash, changes, acknowledgedAt: changes ? null : now });

  await db
    .delete(manaApiCheck)
    .where(and(eq(manaApiCheck.ok, true), isNull(manaApiCheck.changes), lt(manaApiCheck.checkedAt, new Date(now.getTime() - keepQuietChecksDays * 86_400_000))));
  return result;
}

export type ApiWatchStatus = {
  lastCheck: { at: Date; ok: boolean; error: string | null } | null;
  /** Changes nobody has marked as checked yet, oldest first. */
  pending: { id: string; at: Date; changes: SpecChanges }[];
};

export async function getApiWatchStatus(db: Db): Promise<ApiWatchStatus> {
  const [[last], pending] = await Promise.all([
    db.select().from(manaApiCheck).orderBy(desc(manaApiCheck.checkedAt)).limit(1),
    db
      .select()
      .from(manaApiCheck)
      .where(and(isNotNull(manaApiCheck.changes), isNull(manaApiCheck.acknowledgedAt)))
      .orderBy(manaApiCheck.checkedAt),
  ]);
  return {
    lastCheck: last ? { at: last.checkedAt, ok: last.ok, error: last.error } : null,
    pending: pending.map((p) => ({ id: p.id, at: p.checkedAt, changes: p.changes! })),
  };
}

/** Marks every waiting change as checked by this user. */
export async function acknowledgeApiChanges(db: Db, userId: string, now: Date = new Date()) {
  await db
    .update(manaApiCheck)
    .set({ acknowledgedAt: now, acknowledgedById: userId })
    .where(and(isNotNull(manaApiCheck.changes), isNull(manaApiCheck.acknowledgedAt)));
}
