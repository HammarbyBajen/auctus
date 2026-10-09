import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManaError } from "@/lib/mana/errors";
import type { ManaSource } from "@/lib/mana/sync";

const hasDb = Boolean(process.env.DATABASE_URL);
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/mana/${name}.json`, "utf8"));
const base = "https://www.getmana.app/api/v1/studios/studio-1";

/** A stand-in for Mana that serves the recorded pages and counts what it was asked. */
class FakeMana implements ManaSource {
  lastRequestAt: number | null = null;
  usersCalls: (string | null)[] = [];
  membershipCalls: string[] = [];
  failMembershipsFor: { id: string; error: Error } | null = null;
  users = [fixture("users-page-0"), fixture("users-page-1")];
  memberships: Record<string, unknown> = {
    "user-a": fixture("user-memberships-a"),
    "user-b": fixture("user-memberships-b"),
    "user-e": fixture("user-memberships-e"),
  };

  async getUsersPage(nextUrl: string | null) {
    this.usersCalls.push(nextUrl);
    const index = nextUrl ? Number(new URL(nextUrl).searchParams.get("pageIndex")) : 0;
    const page = this.users[index];
    return { items: page.data.items, next: page.links.next as string | null, total: page.meta.totalCount as number };
  }

  async getUserMemberships(id: string) {
    this.membershipCalls.push(id);
    if (this.failMembershipsFor?.id === id) throw this.failMembershipsFor.error;
    return (this.memberships[id] as { data: { items: never[] } } | undefined)?.data.items ?? [];
  }
}

describe.skipIf(!hasDb)("Mana sync", () => {
  const tag = `msync-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let sync: typeof import("@/lib/mana/sync");
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");

  async function fresh() {
    await db.delete(schema.syncRun).where(eq(schema.syncRun.studioId, studioA));
    await db.delete(schema.manaMember).where(eq(schema.manaMember.studioId, studioA));
    await db.delete(schema.manaMembership).where(eq(schema.manaMembership.studioId, studioA));
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    sync = await import("@/lib/mana/sync");
    const rows = await db
      .insert(schema.studio)
      .values([
        { slug: `${tag}-a`, name: "A" },
        { slug: `${tag}-b`, name: "B" },
      ])
      .returning();
    studioA = rows[0].id;
    studioB = rows[1].id;
  });

  afterAll(async () => {
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("mirrors every person across all pages, and the memberships of members only", async () => {
    await fresh();
    const mana = new FakeMana();
    const result = await sync.runToCompletion(db, mana, studioA);
    expect(result.status).toBe("succeeded");

    // The next link was followed from the first page to the last.
    expect(mana.usersCalls).toEqual([null, `${base}/users?pageIndex=1&pageSize=100`]);

    const members = await db.select().from(schema.manaMember).where(eq(schema.manaMember.studioId, studioA));
    expect(members.map((m) => m.manaUserId).sort()).toEqual(["user-a", "user-b", "user-c", "user-d", "user-e"]);
    const anna = members.find((m) => m.manaUserId === "user-a");
    expect(anna).toMatchObject({ role: "member", emailNormalized: "anna@example.test", phoneNormalized: "0701000001" });
    expect(members.find((m) => m.manaUserId === "user-b")?.phone).toBeNull();

    // Staff and the owner have no membership requests made for them.
    expect(mana.membershipCalls.sort()).toEqual(["user-a", "user-b", "user-e"]);

    const memberships = await db.select().from(schema.manaMembership).where(eq(schema.manaMembership.studioId, studioA));
    expect(memberships.map((m) => m.id).sort()).toEqual(["um-a1", "um-a2", "um-b1"]);
    expect(memberships.find((m) => m.id === "um-a2")).toMatchObject({
      status: "active",
      name: "Performance",
      pendingChangeKind: "cancel",
      pendingChangeDate: "2026-11-30",
      commitmentEndDate: "2027-09-06",
      priceAmount: 209500,
      priceCurrency: "SEK",
    });
    expect(memberships.find((m) => m.id === "um-a1")).toMatchObject({ status: "ended", cancelEffectiveDate: "2026-08-31" });

    const [run] = await db.select().from(schema.syncRun).where(eq(schema.syncRun.studioId, studioA));
    expect(run.status).toBe("succeeded");
    expect(run.finishedAt).toBeInstanceOf(Date);
    expect(run.progress).toMatchObject({ usersSeen: 5, usersTotal: 5, membersDone: 3, membersTotal: 3 });
  });

  it("stops when out of time, then continues from where it stopped without repeating work", async () => {
    await fresh();
    const mana = new FakeMana();
    const started = await sync.startRun(db, studioA);
    if (started.status !== "started") throw new Error("expected a new run");

    // A clock that moves one second per look, with a 2 second budget: room for a request or two.
    let t = 0;
    const clock = () => (t += 1000);
    const first = await sync.runBatch(db, mana, started.runId, { budgetMs: 2500, clock });
    expect(first.done).toBe(false);
    const callsAfterFirst = mana.usersCalls.length + mana.membershipCalls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const [midway] = await db.select().from(schema.syncRun).where(eq(schema.syncRun.id, started.runId));
    expect(midway.status).toBe("running");

    let guard = 0;
    for (;;) {
      const { done } = await sync.runBatch(db, mana, started.runId, { budgetMs: 2500, clock });
      if (done) break;
      if ((guard += 1) > 20) throw new Error("sync did not finish");
    }

    // Each page and each member was asked for exactly once across all the batches.
    expect(mana.usersCalls).toHaveLength(2);
    expect([...mana.membershipCalls].sort()).toEqual(["user-a", "user-b", "user-e"]);
    const [final] = await db.select().from(schema.syncRun).where(eq(schema.syncRun.id, started.runId));
    expect(final.status).toBe("succeeded");
    expect((await db.select().from(schema.manaMembership).where(eq(schema.manaMembership.studioId, studioA))).length).toBe(3);
  });

  it("removes people Mana no longer returns, and replaces a person's memberships", async () => {
    await fresh();
    await sync.runToCompletion(db, new FakeMana(), studioA);

    const mana = new FakeMana();
    mana.users[1].data.items = mana.users[1].data.items.filter((u: { userId: string }) => u.userId !== "user-e");
    mana.users[0].meta.totalCount = 4;
    mana.users[1].meta.totalCount = 4;
    const annaMemberships = mana.memberships["user-a"] as { data: { items: unknown[] } };
    annaMemberships.data.items = annaMemberships.data.items.slice(1); // only the active one is left
    await sync.runToCompletion(db, mana, studioA);

    const members = await db.select().from(schema.manaMember).where(eq(schema.manaMember.studioId, studioA));
    expect(members.map((m) => m.manaUserId).sort()).toEqual(["user-a", "user-b", "user-c", "user-d"]);
    const memberships = await db.select().from(schema.manaMembership).where(eq(schema.manaMembership.studioId, studioA));
    expect(memberships.map((m) => m.id).sort()).toEqual(["um-a2", "um-b1"]);
  });

  it("does not start a second run while one is moving, and replaces one that has stopped", async () => {
    await fresh();
    const first = await sync.startRun(db, studioA);
    expect(first.status).toBe("started");
    const second = await sync.startRun(db, studioA);
    expect(second).toEqual({ status: "busy", runId: first.runId });

    // Ten minutes later with no progress: the old run is declared dead and a new one starts.
    const later = await sync.startRun(db, studioA, { now: new Date(Date.now() + 10 * 60_000) });
    expect(later.status).toBe("started");
    expect(later.runId).not.toBe(first.runId);
    const runs = await db.select().from(schema.syncRun).where(eq(schema.syncRun.studioId, studioA));
    expect(runs.find((r) => r.id === first.runId)?.status).toBe("failed");
    expect(runs.filter((r) => r.status === "running")).toHaveLength(1);
  });

  it("the database itself refuses two running runs for one studio", async () => {
    await fresh();
    await sync.startRun(db, studioA);
    await expect(
      db.insert(schema.syncRun).values({ studioId: studioA, progress: sync.initialProgress }),
    ).rejects.toThrow();
  });

  it("two studios can sync at the same time and never see each other's people", async () => {
    await fresh();
    const [a, b] = await Promise.all([
      sync.runToCompletion(db, new FakeMana(), studioA),
      sync.runToCompletion(db, new FakeMana(), studioB),
    ]);
    expect(a.status).toBe("succeeded");
    expect(b.status).toBe("succeeded");
    const countFor = async (studioId: string) =>
      (await db.select().from(schema.manaMember).where(eq(schema.manaMember.studioId, studioId))).length;
    expect(await countFor(studioA)).toBe(5);
    expect(await countFor(studioB)).toBe(5);
    await db.delete(schema.manaMember).where(eq(schema.manaMember.studioId, studioB));
    expect(await countFor(studioA)).toBe(5);
  });

  it("records a failure with a safe message and stops", async () => {
    await fresh();
    const mana = new FakeMana();
    mana.failMembershipsFor = { id: "user-b", error: new ManaError("auth", "Mana-nyckeln fungerar inte (nekad åtkomst).") };
    await expect(sync.runToCompletion(db, mana, studioA)).rejects.toMatchObject({ code: "auth" });
    const [run] = await db.select().from(schema.syncRun).where(eq(schema.syncRun.studioId, studioA));
    expect(run.status).toBe("failed");
    expect(run.error).toBe("Mana-nyckeln fungerar inte (nekad åtkomst).");
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  it("does not store an unexpected error's details", async () => {
    await fresh();
    const mana = new FakeMana();
    mana.failMembershipsFor = { id: "user-a", error: new Error("secret token abc123 in a stack trace") };
    await expect(sync.runToCompletion(db, mana, studioA)).rejects.toThrow();
    const [run] = await db.select().from(schema.syncRun).where(eq(schema.syncRun.studioId, studioA));
    expect(run.error).toBe("Okänt fel i synken");
    expect(JSON.stringify(run)).not.toContain("abc123");
  });

  it("skips a person who has disappeared from Mana since the list was read (404)", async () => {
    await fresh();
    const mana = new FakeMana();
    mana.failMembershipsFor = { id: "user-b", error: new ManaError("api", "Mana svarade med fel 404.", { status: 404 }) };
    const result = await sync.runToCompletion(db, mana, studioA);
    expect(result.status).toBe("succeeded");
    const memberships = await db
      .select()
      .from(schema.manaMembership)
      .where(and(eq(schema.manaMembership.studioId, studioA), eq(schema.manaMembership.manaUserId, "user-b")));
    expect(memberships).toHaveLength(0);
  });

  it("carries the request spacing from one step to the next", async () => {
    await fresh();
    const mana = new FakeMana();
    const started = await sync.startRun(db, studioA);
    if (started.status !== "started") throw new Error("expected a new run");
    // The stand-in "makes a request" by stamping the time, like the real client does.
    const original = mana.getUsersPage.bind(mana);
    mana.getUsersPage = async (next) => {
      mana.lastRequestAt = 123_456;
      return original(next);
    };
    let t = 0;
    await sync.runBatch(db, mana, started.runId, { budgetMs: 1500, clock: () => (t += 1000) });
    const [run] = await db.select().from(schema.syncRun).where(eq(schema.syncRun.id, started.runId));
    expect(run.progress.lastRequestAt).toBe(123_456);
    // A fresh source for the next step starts from the saved time.
    const next = new FakeMana();
    await sync.runBatch(db, next, started.runId, { budgetMs: 0 });
    expect(next.lastRequestAt).toBe(123_456);
  });
});
