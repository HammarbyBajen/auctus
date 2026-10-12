import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Mana API watch", () => {
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let watch: typeof import("@/lib/mana/api-watch-service");

  const spec = (extraField = false) => ({
    openapi: "3.0.0",
    info: { description: extraField ? "v2" : "v1" },
    paths: {
      "/api/v1/studios/{studioId}/users": {
        get: { responses: { "200": { content: { "application/json": { schema: { type: "object", properties: extraField ? { id: { type: "string" }, role: { type: "string" } } : { id: { type: "string" } } } } } } } },
      },
    },
  });
  const reworded = () => ({ ...spec(), info: { description: "reworded" } });
  const at = (day: number) => new Date(Date.UTC(2026, 9, day, 4));

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    watch = await import("@/lib/mana/api-watch-service");
  });

  // The watch is not per studio, so these tables are emptied for each test (a test database only).
  beforeEach(async () => {
    await db.delete(schema.manaApiCheck);
    await db.delete(schema.manaApiSpec);
  });

  afterAll(async () => {
    await db.delete(schema.manaApiCheck);
    await db.delete(schema.manaApiSpec);
    await pool.end();
  });

  it("saves a first copy without an alert, then stays quiet while nothing changes", async () => {
    expect(await watch.runApiWatch(db, async () => spec(), at(1))).toEqual({ kind: "baseline" });
    expect(await watch.runApiWatch(db, async () => spec(), at(2))).toEqual({ kind: "unchanged" });
    expect((await watch.getApiWatchStatus(db)).pending).toEqual([]);
  });

  it("saves a reworded spec without an alert", async () => {
    await watch.runApiWatch(db, async () => spec(), at(1));
    expect(await watch.runApiWatch(db, async () => reworded(), at(2))).toEqual({ kind: "changed", changes: null });
    expect((await watch.getApiWatchStatus(db)).pending).toEqual([]);
    expect(await db.select().from(schema.manaApiSpec)).toHaveLength(2);
  });

  it("alerts on a real change until an owner marks it checked", async () => {
    await watch.runApiWatch(db, async () => spec(), at(1));
    const result = await watch.runApiWatch(db, async () => spec(true), at(2));
    expect(result).toMatchObject({ kind: "changed", changes: { touchesSync: true } });
    const status = await watch.getApiWatchStatus(db);
    expect(status.pending).toHaveLength(1);
    expect(status.pending[0].changes.added).toEqual(["GET /api/v1/studios/{studioId}/users · 200 application/json role: string"]);

    // The next night compares with the new copy, so the same change is not reported twice.
    expect(await watch.runApiWatch(db, async () => spec(true), at(3))).toEqual({ kind: "unchanged" });
    expect((await watch.getApiWatchStatus(db)).pending).toHaveLength(1);

    await watch.acknowledgeApiChanges(db, null as never);
    expect((await watch.getApiWatchStatus(db)).pending).toEqual([]);
  });

  it("records a failure to read instead of ignoring it", async () => {
    expect(await watch.runApiWatch(db, async () => { throw new Error("Kunde inte nå Manas API-beskrivning."); }, at(1))).toEqual({
      kind: "failed",
      error: "Kunde inte nå Manas API-beskrivning.",
    });
    expect(await watch.runApiWatch(db, async () => "<html>", at(2))).toMatchObject({ kind: "failed" });
    expect((await watch.getApiWatchStatus(db)).lastCheck).toMatchObject({ ok: false });
  });

  it("forgets quiet checks after 30 days but keeps changes and failures", async () => {
    await watch.runApiWatch(db, async () => spec(), at(1));
    await watch.runApiWatch(db, async () => { throw new Error("x"); }, at(2));
    await watch.runApiWatch(db, async () => spec(true), at(3));
    await watch.runApiWatch(db, async () => spec(true), new Date(Date.UTC(2026, 10, 20, 4)));
    const checks = await db.select().from(schema.manaApiCheck);
    expect(checks.map((c) => (c.changes ? "change" : c.ok ? "quiet" : "failure")).sort()).toEqual(["change", "failure", "quiet"]);
  });
});
