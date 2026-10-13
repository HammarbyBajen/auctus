import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("at-risk members", () => {
  const tag = `risk-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let risk: typeof import("@/lib/mana/at-risk-service");
  const day = (d: string, h = 17) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`);

  type Booking = { id: string; userId: string; startsAt: string; status: string };
  type CheckIn = { id: string; createdAt: string; user: { id: string } };
  const fake = (bookings: Booking[], checkIns: CheckIn[] = []) => {
    const calls: [string, string][] = [];
    return {
      calls,
      getClassBookings: async (fromAt: string, toAt: string) => {
        calls.push([fromAt, toAt]);
        return bookings.filter((b) => b.startsAt >= fromAt && b.startsAt <= toAt);
      },
      getGymCheckIns: async () => checkIns,
    };
  };

  const membership = (id: string, user: string, extra: Partial<typeof schema.manaMembership.$inferInsert> = {}) => ({
    studioId,
    id: `${tag}-${id}`,
    manaUserId: user,
    membershipId: "basic",
    name: "Basic",
    type: "standard",
    status: "active",
    startDate: "2026-09-01",
    priceAmount: 169500,
    priceCurrency: "SEK",
    ...extra,
  });
  const person = (id: string, role = "member") => ({ studioId, manaUserId: id, role, name: `Namn ${id}`, email: `${id}-${tag}@example.test`, lastRunId: "seed" });

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    risk = await import("@/lib/mana/at-risk-service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Risk" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    [{ id: ownerId }] = await db
      .insert(schema.user)
      .values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId })
      .returning();
    await db.insert(schema.manaMember).values([person("away"), person("regular"), person("ghost"), person("coach", "staff")] as never);
    await db
      .insert(schema.manaMembership)
      .values([membership("1", "away"), membership("2", "regular"), membership("3", "ghost"), membership("4", "coach")]);
  });

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("mirrors visits up to now, and reads the last days again so a booking's later status wins", async () => {
    const first = fake([
      { id: "b1", userId: "away", startsAt: "2026-09-20T17:00:00Z", status: "checked_in" },
      { id: "b2", userId: "regular", startsAt: "2026-10-28T17:00:00Z", status: "booked" },
      { id: "b3", userId: "regular", startsAt: "2026-11-05T17:00:00Z", status: "booked" },
    ]);
    await risk.syncVisits(db, first, studioId, day("2026-10-31", 9));
    expect(first.calls[0][0]).toBe("2026-09-01T00:00:00Z");
    const second = fake([{ id: "b2", userId: "regular", startsAt: "2026-10-28T17:00:00Z", status: "no_show" }]);
    await risk.syncVisits(db, second, studioId, day("2026-10-31", 9));
    expect(second.calls[0][0]).toBe("2026-10-25T17:00:00.000Z");
    const visits = await db.select().from(schema.manaVisit).where(eq(schema.manaVisit.studioId, studioId));
    expect(visits.map((v) => [v.id, v.status]).sort()).toEqual([
      ["b1", "checked_in"],
      ["b2", "no_show"],
    ]);
  });

  it("alerts once per absence, only for customers, and lists them with what staff need", async () => {
    const result = await risk.detectAtRisk(db, studioId, day("2026-10-31", 9));
    // regular's only booking was a no-show, so all three customers are away; the coach (staff) is not.
    expect(result).toEqual({ created: 3, resolved: 0, away: 3 });
    expect((await risk.detectAtRisk(db, studioId, day("2026-11-01", 9))).created).toBe(0);
    const rows = await risk.listAtRisk(db, studioId, day("2026-11-01", 9));
    expect(rows.map((r) => r.name)).toEqual(["Namn ghost", "Namn regular", "Namn away"]);
    expect(rows.find((r) => r.name === "Namn away")).toMatchObject({ lastVisitAt: day("2026-09-20"), memberships: ["Basic"] });
  });

  it("does not bring a handled alert back until the person has been in again", async () => {
    const [away] = (await risk.listAtRisk(db, studioId)).filter((r) => r.name === "Namn away");
    await risk.handleAtRisk(db, studioId, away.id, ownerId, { kind: "dismissed", reason: "holiday" });
    expect((await risk.detectAtRisk(db, studioId, day("2026-11-02", 9))).created).toBe(0);
    // Back once in October, then away for 30 days again: a new alert.
    await db.insert(schema.manaVisit).values({ studioId, id: "b9", manaUserId: "away", at: day("2026-10-01"), kind: "class", status: "booked" });
    expect((await risk.detectAtRisk(db, studioId, day("2026-11-02", 9))).created).toBe(1);
  });

  it("resolves an open alert when the person comes back, and counts gym check-ins as visits", async () => {
    await risk.syncVisits(db, fake([], [{ id: "c1", createdAt: "2026-11-02T08:00:00Z", user: { id: "ghost" } }]), studioId, day("2026-11-02", 9));
    const result = await risk.detectAtRisk(db, studioId, day("2026-11-02", 9));
    expect(result.resolved).toBe(1);
    expect((await risk.listAtRisk(db, studioId, day("2026-11-02", 9))).map((r) => r.name)).not.toContain("Namn ghost");
  });
});
