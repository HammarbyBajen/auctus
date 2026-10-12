import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("kpi snapshots", () => {
  const tag = `kpi-${Date.now()}`;
  let studioId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let kpi: typeof import("@/lib/kpi/service");

  const membership = (id: string, user: string, name: string, price: number, startDate = "2026-09-23") => ({
    studioId,
    id: `${tag}-${id}`,
    manaUserId: user,
    membershipId: name,
    name,
    type: "standard",
    status: "active",
    startDate,
    priceAmount: price,
    priceCurrency: "SEK",
  });

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    kpi = await import("@/lib/kpi/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "KPI" }).returning();
  });

  afterAll(async () => {
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("saves nothing before there is any Mana data", async () => {
    expect(await kpi.recordKpiSnapshot(db, studioId, "2026-09-30")).toBeNull();
  });

  it("saves one snapshot a day, a second run replacing the first, and the trend reads it", async () => {
    await db.insert(schema.manaMembership).values([membership("1", "a", "Basic", 169500), membership("2", "b", "Basic", 169500)]);
    expect(await kpi.recordKpiSnapshot(db, studioId, "2026-09-30")).toMatchObject({ payingMembers: 2, revenue: 339000 });
    await db.insert(schema.manaMembership).values(membership("3", "c", "Basic", 169500));
    await kpi.recordKpiSnapshot(db, studioId, "2026-09-30");
    const rows = await db.select().from(schema.kpiSnapshot).where(eq(schema.kpiSnapshot.studioId, studioId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ day: "2026-09-30", payingMembers: 3, byName: { Basic: 3 } });

    // Mana later forgets one of September's memberships: the saved September stands.
    await db.delete(schema.manaMembership).where(eq(schema.manaMembership.id, `${tag}-3`));
    const { trend } = await kpi.getKpi(db, studioId, "2026-10-10");
    expect(trend.series[""].at(-2)).toMatchObject({ month: "2026-09", count: 3 });
    expect(trend.series[""].at(-1)).toMatchObject({ month: "2026-10", count: 2 });
  });
});
