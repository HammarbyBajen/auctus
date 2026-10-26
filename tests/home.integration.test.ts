import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const H = 3_600_000;
const D = 86_400_000;

describe.skipIf(!hasDb)("home page data", () => {
  const tag = `home-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let me: string;
  let other: string;
  let leads: typeof import("@/lib/leads/service");
  let tasks: typeof import("@/lib/tasks/service");
  let home: typeof import("@/lib/home/service");
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let counter = 0;
  const now = new Date();

  async function newLead(studioId: string, age: { created?: number; updated?: number } = {}) {
    counter += 1;
    const { lead } = await leads.createOrMatchLead(db, studioId, {
      name: `Person ${counter}`,
      email: `p${counter}-${tag}@example.test`,
      source: "manual",
    });
    await db
      .update(schema.lead)
      .set({
        createdAt: new Date(now.getTime() - (age.created ?? 0)),
        updatedAt: new Date(now.getTime() - (age.updated ?? age.created ?? 0)),
      })
      .where(eq(schema.lead.id, lead.id));
    return lead;
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    leads = await import("@/lib/leads/service");
    tasks = await import("@/lib/tasks/service");
    home = await import("@/lib/home/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const rows = await db
      .insert(schema.studio)
      .values([
        { slug: `${tag}-a`, name: "A" },
        { slug: `${tag}-b`, name: "B" },
      ])
      .returning();
    studioA = rows[0].id;
    studioB = rows[1].id;
    await ensureDefaultPipeline(db, studioA);
    await ensureDefaultPipeline(db, studioB);
    await db.insert(schema.studioSettings).values([{ studioId: studioA }, { studioId: studioB }]);
    me = `${tag}-me`;
    other = `${tag}-other`;
    await db.insert(schema.user).values([
      { id: me, name: "Jag", email: `${tag}-me@example.test`, studioId: studioA },
      { id: other, name: "Annan", email: `${tag}-other@example.test`, studioId: studioA },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(inArray(schema.lead.studioId, [studioA, studioB]));
    await db.delete(schema.person).where(inArray(schema.person.studioId, [studioA, studioB]));
    await db.delete(schema.user).where(inArray(schema.user.id, [me, other]));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("falls back to the default thresholds", async () => {
    expect(await home.getThresholds(db, studioA)).toMatchObject({
      firstContactHours: 24,
      warnHoursBeforeDeadline: 4,
      stalledDays: 7,
    });
  });

  it("lists overdue, task and stalled leads most urgent first, and leaves out handled ones", async () => {
    const red = await newLead(studioA, { created: 30 * H });
    const stalled = await newLead(studioA, { created: 20 * D, updated: 9 * D });
    await leads.moveLeadStage(db, studioA, stalled.id, "price_info");
    await db.update(schema.lead).set({ updatedAt: new Date(now.getTime() - 9 * D) }).where(eq(schema.lead.id, stalled.id));
    const withTask = await newLead(studioA, { created: 3 * D });
    await leads.moveLeadStage(db, studioA, withTask.id, "contacted");
    await tasks.createTask(db, studioA, withTask.id, { title: "Ring", dueDate: "2000-01-01" }, null);
    const handled = await newLead(studioA, { created: 20 * D });
    await leads.moveLeadStage(db, studioA, handled.id, "contacted");
    await tasks.createTask(db, studioA, handled.id, { title: "Senare", dueDate: "2999-01-01" }, null);
    await db.update(schema.lead).set({ updatedAt: new Date(now.getTime() - 20 * D) }).where(eq(schema.lead.id, handled.id));
    const gone = await newLead(studioA, { created: 40 * D });
    await leads.moveLeadStage(db, studioA, gone.id, "cold", { coldReason: "price" });

    const { items } = await home.getHomeData(db, studioA, me, "all", now);
    const ids = items.map((i) => i.lead.id);
    expect(ids).toContain(red.id);
    expect(ids).toContain(stalled.id);
    expect(ids).toContain(withTask.id);
    expect(ids).not.toContain(handled.id); // has an open task, so it is handled
    expect(ids).not.toContain(gone.id); // cold leads never show
    expect(ids.indexOf(red.id)).toBeLessThan(ids.indexOf(withTask.id));
    expect(ids.indexOf(withTask.id)).toBeLessThan(ids.indexOf(stalled.id));
    expect(items.find((i) => i.lead.id === red.id)?.severity).toBe("red");
  });

  it("filters by mine or all", async () => {
    const mine = await newLead(studioA, { created: 30 * H });
    const theirs = await newLead(studioA, { created: 30 * H });
    await tasks.assignLead(db, studioA, mine.id, me);
    await tasks.assignLead(db, studioA, theirs.id, other);
    const all = (await home.getHomeData(db, studioA, me, "all", now)).items.map((i) => i.lead.id);
    const onlyMine = (await home.getHomeData(db, studioA, me, "mine", now)).items.map((i) => i.lead.id);
    expect(all).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    expect(onlyMine).toContain(mine.id);
    expect(onlyMine).not.toContain(theirs.id);
  });

  it("counts new this week, booked tests and won this month", async () => {
    const before = (await home.getHomeData(db, studioB, "x", "all", now)).counts;
    expect(before).toEqual({ newThisWeek: 0, bookedTests: 0, wonThisMonth: 0, fromMana: 0 });

    const fresh = await newLead(studioB, { created: 60_000 });
    const old = await newLead(studioB, { created: 40 * D });
    const test1 = await newLead(studioB, { created: 40 * D });
    const test2 = await newLead(studioB, { created: 40 * D });
    await leads.moveLeadStage(db, studioB, test1.id, "booked_test_training");
    await leads.moveLeadStage(db, studioB, test2.id, "booked_test_training");
    await leads.moveLeadStage(db, studioB, old.id, "won");
    expect(fresh.id).toBeTruthy();

    const counts = (await home.getHomeData(db, studioB, "x", "all", now)).counts;
    expect(counts.newThisWeek).toBe(1); // only the lead created a minute ago
    expect(counts.bookedTests).toBe(2);
    expect(counts.wonThisMonth).toBe(1);
  });

  it("keeps Mana's leads out of new this week and off the list, counted on their own", async () => {
    const { ensureManaStage } = await import("@/lib/pipeline/service");
    await ensureManaStage(db, studioB);
    const before = (await home.getHomeData(db, studioB, "x", "all", now)).counts;
    const mana = await newLead(studioB, { created: 60_000 });
    await db.update(schema.lead).set({ source: "mana_ended", stage: "from_mana", updatedAt: new Date(now.getTime() - 10 * D) }).where(eq(schema.lead.id, mana.id));
    const after = await home.getHomeData(db, studioB, "x", "all", now);
    expect(after.counts.newThisWeek).toBe(before.newThisWeek);
    expect(after.counts.fromMana).toBe(1);
    // Not overdue for first contact, not stalled, not asked why: it waits in its own column.
    expect(after.items.some((i) => i.lead.id === mana.id)).toBe(false);
    await db.delete(schema.lead).where(eq(schema.lead.id, mana.id));
  });

  it("does not leak another studio's leads", async () => {
    const { items } = await home.getHomeData(db, studioB, "x", "all", now);
    expect(items.every((i) => i.lead.personName.startsWith("Person"))).toBe(true);
    const idsA = (await db.select({ id: schema.lead.id }).from(schema.lead).where(eq(schema.lead.studioId, studioA))).map((r) => r.id);
    expect(items.some((i) => idsA.includes(i.lead.id))).toBe(false);
  });

  it("counts working on a task as activity, so the lead is not stalled", async () => {
    const l = await newLead(studioA, { created: 20 * D, updated: 20 * D });
    await leads.moveLeadStage(db, studioA, l.id, "contacted");
    await db.update(schema.lead).set({ updatedAt: new Date(now.getTime() - 20 * D) }).where(eq(schema.lead.id, l.id));
    const created = await tasks.createTask(db, studioA, l.id, { title: "x", dueDate: "2999-01-01" }, null);
    await tasks.setTaskDone(db, studioA, created.id, true, null);
    const found = await leads.getLead(db, studioA, l.id);
    expect(found?.lead.updatedAt.getTime()).toBeGreaterThan(now.getTime() - D);
  });
});
