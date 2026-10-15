import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("the lead report from the database", () => {
  const tag = `report-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let leads: typeof import("@/lib/leads/service");
  let reports: typeof import("@/lib/reports/service");
  const now = new Date("2026-10-15T08:00:00Z");

  const make = async (name: string, createdAt: string, source = "contact_form") => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: `${name} ${tag}`, email: `${name.toLowerCase()}-${tag}@example.test`, phone: "", source: source as "contact_form" });
    await db.update(schema.lead).set({ createdAt: new Date(createdAt), updatedAt: new Date(createdAt) }).where(eq(schema.lead.id, lead.id));
    return lead.id;
  };
  /** Moves the lead's events to a time, as if they had happened then. */
  const happenedAt = async (leadId: string, at: string) => {
    await db.update(schema.leadEvent).set({ createdAt: new Date(at) }).where(eq(schema.leadEvent.leadId, leadId));
  };

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    leads = await import("@/lib/leads/service");
    reports = await import("@/lib/reports/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Rapport" }).returning();
    await ensureDefaultPipeline(db, studioId);
    await db.insert(schema.studioSettings).values({ studioId });
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
  });

  afterAll(async () => {
    await db.delete(schema.leadEvent).where(eq(schema.leadEvent.studioId, studioId));
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("matches a hand count: two contacted (3 h and 26 h), one of them won, one waiting, one imported", async () => {
    const anna = await make("Anna", "2026-10-01T08:00:00Z");
    await leads.logContact(db, studioId, anna, "called", ownerId);
    await happenedAt(anna, "2026-10-01T11:00:00Z");
    await leads.moveLeadStage(db, studioId, anna, "won", { authorId: ownerId });

    const bo = await make("Bo", "2026-10-02T08:00:00Z", "chat_bot");
    await leads.moveLeadStage(db, studioId, bo, "contacted", { authorId: ownerId });
    await happenedAt(bo, "2026-10-03T10:00:00Z");

    await make("Cia", "2026-10-10T08:00:00Z");

    const imported = await make("Dan", "2026-09-15T08:00:00Z", "pipedrive");
    await db.update(schema.lead).set({ externalRef: `pipedrive:${tag}` }).where(eq(schema.lead.id, imported));

    const { report, firstContactHours } = await reports.getLeadReport(db, studioId, now);
    expect(firstContactHours).toBe(24);
    expect(report.months.at(-1)).toMatchObject({ month: "2026-10", total: 3, own: 3, won: 1, bySource: { contact_form: 2, chat_bot: 1 } });
    expect(report.months.at(-2)).toMatchObject({ month: "2026-09", total: 1, own: 0, bySource: { pipedrive: 1 } });
    expect(report.conversion).toEqual({ leads: 3, won: 1 });
    // 3 h and 26 h: average 14.5, median 14.5, one of two within 24 h.
    expect(report.contact).toEqual({ contacted: 2, waiting: 1, averageHours: 14.5, medianHours: 14.5, withinLimit: 0.5 });
  });
});
