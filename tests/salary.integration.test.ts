import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManaError } from "@/lib/mana/errors";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("hours: pulling and locking a month", () => {
  const tag = `salary-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let salary: typeof import("@/lib/salary/service");

  type ClassEvent = { id: string; class: { id: string; title: string }; startsAt: string; endsAt: string; instructorId: string | null };
  const classEvent = (id: string, startsAt: string, minutes = 60, instructorId: string | null = "i-anna"): ClassEvent => ({
    id,
    class: { id: "wod", title: "WOD" },
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString(),
    instructorId,
  });

  const fake = (events: ClassEvent[], maxPerRequest = Infinity) => {
    const calls: string[] = [];
    return {
      calls,
      getInstructors: async () => [{ id: "i-anna", name: "Anna A" }],
      getClassEvents: async (fromAt: string, toAt: string) => {
        calls.push(`${fromAt}..${toAt}`);
        const found = events.filter((e) => e.startsAt >= fromAt && e.startsAt < toAt);
        if (found.length > maxPerRequest) throw new ManaError("api", "Mana svarade med fel 413.", { status: 413 });
        return found;
      },
      getServiceBookings: async () => [
        { id: "b1", specialistServiceId: "pt60", instructorId: "i-anna", startsAt: "2026-10-07T10:00:00.000Z", endsAt: "2026-10-07T11:00:00.000Z", status: "completed" },
        { id: "b2", specialistServiceId: "pt60", instructorId: "i-anna", startsAt: "2026-10-08T10:00:00.000Z", endsAt: "2026-10-08T11:00:00.000Z", status: "canceled" },
      ],
      getSpecialistServices: async () => [{ id: "pt60", name: "PT60" }],
      getCourses: async () => [{ id: "kids", name: "Tegen Kids" }],
      getCourseEvents: async () => [
        { id: "k1", startsAt: "2026-10-10T08:00:00.000Z", endsAt: "2026-10-10T08:45:00.000Z", instructorId: "i-anna" },
        // Outside the pull window: left out.
        { id: "k0", startsAt: "2026-08-01T08:00:00.000Z", endsAt: "2026-08-01T08:45:00.000Z", instructorId: "i-anna" },
      ],
    };
  };

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    salary = await import("@/lib/salary/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Lön" }).returning();
    [{ id: ownerId }] = await db
      .insert(schema.user)
      .values({ id: `${tag}-owner`, name: "Fredrik", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId })
      .returning();
  });

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  const t0 = new Date("2026-10-31T12:00:00Z");

  it("pulls a month, splitting a window Mana finds too big", async () => {
    const events = [classEvent("c0", "2026-09-29T17:00:00+02:00"), classEvent("c1", "2026-10-01T17:00:00+02:00"), classEvent("c2", "2026-10-02T07:00:00+02:00", 30), classEvent("c3", "2026-10-02T17:00:00+02:00"), classEvent("c4", "2026-10-02T18:00:00+02:00", 60, null)];
    const source = fake(events, 2);
    const result = await salary.pullMonth(db, source, studioId, "2026-10", ownerId, t0);
    // c0 is in September; the Kids session in August is left out too.
    expect(result).toEqual({ status: "pulled", sessions: 7, newTypes: 3 });
    // Five windows, and the first one, with four classes, was asked for again in halves.
    expect(source.calls.length).toBeGreaterThan(5);

    const categories = await salary.listCategories(db, studioId);
    expect(categories.map((c) => [c.typeKey, c.counted])).toEqual([
      ["class:wod", true],
      ["course:kids", true],
      ["service:pt60", true],
    ]);
    expect(await salary.listCoaches(db, studioId)).toEqual([{ id: "i-anna", name: "Anna A" }]);
  });

  it("takes in hidden classes as their own categories, counted like the rest until an owner unticks them", async () => {
    const shop = { ...classEvent("h1", "2026-10-03T10:00:00+02:00", 120), class: { id: "shop", title: "Tegenbutik" }, isHidden: true };
    const pt = { ...classEvent("h2", "2026-10-07T12:00:00+02:00"), class: { id: "pt60-class", title: "PT60" }, isHidden: true };
    await salary.pullMonth(db, fake([classEvent("c1", "2026-10-01T17:00:00+02:00"), shop, pt]), studioId, "2026-10", ownerId, t0);
    const categories = await salary.listCategories(db, studioId);
    expect(categories.filter((c) => c.typeKey === "class:shop" || c.typeKey === "class:pt60-class").map((c) => [c.label, c.counted])).toEqual([
      ["PT60 (dold)", true],
      ["Tegenbutik (dold)", true],
    ]);
    // In the total: WOD 1 h, PT booking 1 h, Kids 0.75 h, Tegenbutik 2 h, PT60 class 1 h.
    const before = (await salary.getMonth(db, studioId, "2026-10")).result!.coaches[0];
    expect(before.byType["class:shop"]).toBe(2);
    expect(before.total).toBe(5.75);
    // Unticked, the PT60 class is left out, and stays out on the next pull.
    await salary.setCounted(db, studioId, categories.map((c) => c.typeKey), categories.filter((c) => c.counted && c.typeKey !== "class:pt60-class").map((c) => c.typeKey));
    await salary.pullMonth(db, fake([classEvent("c1", "2026-10-01T17:00:00+02:00"), shop, pt]), studioId, "2026-10", ownerId, t0);
    expect((await salary.getMonth(db, studioId, "2026-10")).result!.coaches[0].total).toBe(4.75);
    // Back to the month the next tests expect.
    await salary.pullMonth(db, fake([classEvent("c1", "2026-10-01T17:00:00+02:00"), classEvent("c2", "2026-10-02T07:00:00+02:00", 30), classEvent("c3", "2026-10-02T17:00:00+02:00"), classEvent("c4", "2026-10-02T18:00:00+02:00", 60, null)]), studioId, "2026-10", ownerId, t0);
  });

  it("shows every coach's hours straight from Mana, by category", async () => {
    const month = await salary.getMonth(db, studioId, "2026-10");
    const anna = month.result!.coaches[0];
    expect(anna.name).toBe("Anna A");
    expect(anna.byType).toEqual({ "class:wod": 2.5, "service:pt60": 1, "course:kids": 0.75 });
    expect(anna.total).toBe(4.25);
    expect(month.result!.unassigned).toHaveLength(1);
    expect(month.result!.notCounted).toEqual({ canceled: 1 });
  });

  it("leaves out the categories an owner unticks, and keeps that choice on the next pull", async () => {
    await salary.setCounted(db, studioId, ["class:wod", "course:kids", "service:pt60"], ["class:wod", "service:pt60"]);
    expect((await salary.getMonth(db, studioId, "2026-10")).result!.coaches[0].total).toBe(3.5);
    await salary.pullMonth(db, fake([classEvent("c3", "2026-10-02T17:00:00+02:00")]), studioId, "2026-10", ownerId, t0);
    const anna = (await salary.getMonth(db, studioId, "2026-10")).result!.coaches[0];
    // The class removed in Mana is gone; Kids is still left out.
    expect(anna.byType["class:wod"]).toBe(1);
    expect(anna.total).toBe(2);
  });

  it("asks for a fresh pull before locking, then freezes the month", async () => {
    const later = new Date(t0.getTime() + salary.staleAfterMs + 1000);
    expect(await salary.lockMonth(db, studioId, "2026-10", ownerId, later)).toEqual({ status: "stale" });
    expect(await salary.lockMonth(db, studioId, "2026-10", ownerId, t0)).toEqual({ status: "locked_now" });

    // Changing the categories or pulling again does not move a locked month.
    await salary.setCounted(db, studioId, ["class:wod", "course:kids", "service:pt60"], []);
    expect(await salary.pullMonth(db, fake([]), studioId, "2026-10", ownerId, t0)).toEqual({ status: "locked" });
    const month = await salary.getMonth(db, studioId, "2026-10");
    expect(month.lockedBy).toBe("Fredrik");
    expect(month.result!.coaches[0].total).toBe(2);
  });

  it("records who unlocked a month, and then calculates it live again", async () => {
    await salary.unlockMonth(db, studioId, "2026-10", ownerId, new Date(t0.getTime() + 1000));
    const log = await salary.monthLog(db, studioId, "2026-10");
    expect(log.map((l) => [l.action, l.by])).toEqual([
      ["unlock", "Fredrik"],
      ["lock", "Fredrik"],
    ]);
    const month = await salary.getMonth(db, studioId, "2026-10");
    expect(month.lockedAt).toBeNull();
    expect(month.result!.coaches[0].total).toBe(0);
    const [row] = await db.select().from(schema.salaryMonth).where(and(eq(schema.salaryMonth.studioId, studioId), eq(schema.salaryMonth.month, "2026-10")));
    expect(row.snapshot).toBeNull();
  });
});
