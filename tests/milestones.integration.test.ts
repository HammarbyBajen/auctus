import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("milestones (ticket 35)", () => {
  const tag = `ms-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let ms: typeof import("@/lib/mana/milestones-service");
  const day = (d: string, h = 17) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`);

  const member = (id: string, role = "member") => ({ studioId, manaUserId: id, role, name: `${id} Efternamn`, email: `${id}-${tag}@example.test`, lastRunId: "seed" });
  const membership = (id: string, user: string, priceAmount = 169500) => ({
    studioId, id: `${tag}-${id}`, manaUserId: user, membershipId: "basic", name: "Basic", type: "standard", status: "active", startDate: "2026-09-01", priceAmount, priceCurrency: "SEK",
  });
  let n = 0;
  const classOn = (user: string, d: string) => ({ studioId, id: `${tag}-v${++n}`, manaUserId: user, at: day(d), kind: "class", status: "booked" });

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    ms = await import("@/lib/mana/milestones-service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "MS" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
    await db.insert(schema.manaMember).values([member("anna"), member("bo"), member("free"), member("coach", "staff")] as never);
    await db.insert(schema.manaMembership).values([membership("1", "anna"), membership("2", "bo"), membership("3", "free", 0), membership("4", "coach")]);
  });

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("starts a studio with the default milestones", async () => {
    const rules = await ms.listMilestoneRules(db, studioId);
    expect(rules.map((r) => `${r.kind}:${r.threshold}`)).toEqual([
      "classes_total:100", "classes_total:250", "classes_total:500", "classes_total:1000",
      "weeks_in_a_row:10", "weeks_in_a_row:26", "weeks_in_a_row:52",
    ]);
  });

  it("reads Mana's figures for paying customers only", async () => {
    const asked: string[] = [];
    const source = { getUserStats: async (id: string) => (asked.push(id), id === "anna" ? { classesTotal: 98, streakWeeks: 9 } : { classesTotal: 40, streakWeeks: 0 }) };
    expect(await ms.syncMemberStats(db, source, studioId, day("2026-10-12", 4))).toEqual({ read: 2 });
    expect(asked.sort()).toEqual(["anna", "bo"]);
    // Read again only after a month.
    expect(await ms.syncMemberStats(db, source, studioId, day("2026-10-20", 4))).toEqual({ read: 0 });
  });

  it("notes the figures at the first check, then records milestones crossed after it, once", async () => {
    expect(await ms.detectMilestones(db, studioId, day("2026-10-12", 5))).toEqual({ checked: 2, reached: 0 });
    // Anna: 98 + 2 classes = 100, and a class in each of the next weeks: 9 + 1 = 10 in a row.
    await db.insert(schema.manaVisit).values([classOn("anna", "2026-10-14"), classOn("anna", "2026-10-16")]);
    expect(await ms.detectMilestones(db, studioId, day("2026-10-19", 5))).toEqual({ checked: 2, reached: 2 });
    const rows = await ms.listMilestones(db, studioId);
    expect(rows.map((r) => [r.name, r.kind, r.threshold, r.reachedOn])).toEqual([
      ["anna Efternamn", "classes_total", 100, "2026-10-19"],
      ["anna Efternamn", "weeks_in_a_row", 10, "2026-10-19"],
    ]);
    expect(rows[0].template.subject).toBe("{antal} pass på CrossFit Tegen");
    expect(await ms.detectMilestones(db, studioId, day("2026-10-20", 5))).toEqual({ checked: 2, reached: 0 });
  });

  it("is handled by staff, and goes by itself after 30 days", async () => {
    const [first, second] = await ms.listMilestones(db, studioId);
    await ms.handleMilestone(db, studioId, first.id, "done", ownerId);
    expect((await ms.listMilestones(db, studioId)).map((r) => r.id)).toEqual([second.id]);
    await ms.detectMilestones(db, studioId, day("2026-11-25", 5));
    expect(await ms.listMilestones(db, studioId)).toEqual([]);
    const [hit] = await db.select().from(schema.milestoneHit).where(eq(schema.milestoneHit.id, second.id));
    expect(hit.status).toBe("expired");
  });

  it("applies a milestone added later from then on only", async () => {
    await ms.addMilestoneRule(db, studioId, "classes_total", 50);
    await ms.detectMilestones(db, studioId, day("2026-11-26", 5));
    // Bo is past 40 + 0; 50 is not crossed; Anna passed 50 long ago.
    expect(await ms.listMilestones(db, studioId)).toEqual([]);
    await expect(ms.addMilestoneRule(db, studioId, "classes_total", 50)).rejects.toThrow("exists");
    await expect(ms.addMilestoneRule(db, studioId, "minutes", 5)).rejects.toThrow("invalid");
  });

  it("forgets a member's milestones and figures on request", async () => {
    await ms.forgetMemberMilestones(db, studioId, "anna");
    expect(await db.select().from(schema.milestoneHit).where(eq(schema.milestoneHit.manaUserId, "anna"))).toEqual([]);
    expect(await db.select().from(schema.memberStats).where(eq(schema.memberStats.manaUserId, "anna"))).toEqual([]);
  });
});
