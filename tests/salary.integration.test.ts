import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManaError } from "@/lib/mana/errors";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("salary: pulling and locking a month", () => {
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

  it("pulls the whole weeks around a month, splitting a window Mana finds too big", async () => {
    const events = [classEvent("c1", "2026-09-29T17:00:00+02:00"), classEvent("c2", "2026-10-06T07:00:00+02:00", 30), classEvent("c3", "2026-10-06T17:00:00+02:00"), classEvent("c4", "2026-10-06T18:00:00+02:00", 60, null)];
    const source = fake(events, 2);
    const result = await salary.pullMonth(db, source, studioId, "2026-10", ownerId, t0);
    expect(result).toEqual({ status: "pulled", sessions: 7, newTypes: 3 });
    // Five weeks, and the week with three classes was asked for again in halves.
    expect(source.calls.length).toBeGreaterThan(5);

    const rules = await salary.listRules(db, studioId);
    expect(rules.map((r) => [r.typeKey, r.paid])).toEqual([
      ["class:wod", null],
      ["course:kids", null],
      ["service:pt60", null],
    ]);
    const coaches = await salary.listCoaches(db, studioId);
    expect(coaches.map((c) => [c.id, c.name, c.freeClassesPerWeek])).toEqual([["i-anna", "Anna A", 0]]);
  });

  it("shows hours per Mana instructor straight away, with unset kinds flagged and not paid", async () => {
    expect(await salary.saveDeal(db, studioId, "i-anna", { freeClassesPerWeek: 1, activeFrom: null, notes: "" })).toBe("saved");
    const month = await salary.getMonth(db, studioId, "2026-10");
    const anna = month.result!.people[0];
    expect(anna.name).toBe("Anna A");
    expect(anna.byType).toEqual({ "class:wod": 1.5, "service:pt60": 1, "course:kids": 0.75 });
    expect(anna.total).toBe(3.25);
    expect(anna.toPay).toBe(0);
    expect(month.result!.unassigned).toHaveLength(1);
    expect(month.result!.notCounted).toEqual({ canceled: 1 });
    expect(month.result!.types.every((t) => t.paid === null)).toBe(true);
  });

  it("keeps a coach's deal when the month is pulled again", async () => {
    await salary.pullMonth(db, fake([]), studioId, "2026-10", ownerId, t0);
    expect((await salary.listCoaches(db, studioId))[0].freeClassesPerWeek).toBe(1);
    expect(await salary.saveDeal(db, studioId, "i-okand", { freeClassesPerWeek: 1, activeFrom: null, notes: "" })).toBe("not_found");
  });

  it("pays by the rules, with the first class of the week free", async () => {
    await salary.pullMonth(db, fake([classEvent("c1", "2026-09-29T17:00:00+02:00"), classEvent("c2", "2026-10-06T07:00:00+02:00", 30), classEvent("c3", "2026-10-06T17:00:00+02:00")]), studioId, "2026-10", ownerId, t0);
    await salary.setRule(db, studioId, "class:wod", true);
    await salary.setRule(db, studioId, "service:pt60", true);
    await salary.setRule(db, studioId, "course:kids", false);
    const anna = (await salary.getMonth(db, studioId, "2026-10")).result!.people[0];
    // WOD 1.5 h (the 30-minute class on Tuesday is the week's free one) + PT 1 h.
    expect([anna.freeClasses, anna.freeHours, anna.toPay]).toEqual([1, 0.5, 2]);
  });

  it("replaces the month on a refresh, so a class removed in Mana is gone", async () => {
    await salary.pullMonth(db, fake([classEvent("c3", "2026-10-06T17:00:00+02:00")]), studioId, "2026-10", ownerId, t0);
    const anna = (await salary.getMonth(db, studioId, "2026-10")).result!.people[0];
    expect(anna.byType["class:wod"]).toBe(1);
    // Rules already decided are kept.
    expect((await salary.listRules(db, studioId)).find((r) => r.typeKey === "class:wod")!.paid).toBe(true);
  });

  it("asks for a fresh pull before locking, then freezes the month", async () => {
    const later = new Date(t0.getTime() + salary.staleAfterMs + 1000);
    expect(await salary.lockMonth(db, studioId, "2026-10", ownerId, later)).toEqual({ status: "stale" });
    expect(await salary.lockMonth(db, studioId, "2026-10", ownerId, t0)).toEqual({ status: "locked_now" });

    // Changing a rule, a person or pulling again does not move a locked month.
    await salary.setRule(db, studioId, "class:wod", false);
    await salary.setRule(db, studioId, "service:pt60", false);
    expect(await salary.pullMonth(db, fake([]), studioId, "2026-10", ownerId, t0)).toEqual({ status: "locked" });
    const month = await salary.getMonth(db, studioId, "2026-10");
    expect(month.lockedBy).toBe("Fredrik");
    expect(month.result!.people[0].toPay).toBe(1);
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
    expect(month.result!.people[0].toPay).toBe(0);
    const [row] = await db.select().from(schema.salaryMonth).where(and(eq(schema.salaryMonth.studioId, studioId), eq(schema.salaryMonth.month, "2026-10")));
    expect(row.snapshot).toBeNull();
  });
});
