import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImportLead } from "@/lib/import/pipedrive";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("pipedrive import", () => {
  const tag = `import-${Date.now()}`;
  let studioId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let importer: typeof import("@/lib/import/pipedrive");

  const item = (ref: string, email: string, stage = "new_lead"): ImportLead => ({
    ref,
    name: `Test ${ref}`,
    email,
    phone: null,
    stage,
    coldReason: stage === "cold" ? "other" : null,
    source: "contact_form",
    createdAt: new Date("2026-09-01T08:00:00Z"),
    updatedAt: new Date("2026-09-02T08:00:00Z"),
    note: "Från Pipedrive: NYA LEADS",
  });

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    importer = await import("@/lib/import/pipedrive");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Import" }).returning();
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("creates leads with their dates, stage, history and note, and a rerun creates nothing", async () => {
    const leads = [item("pipedrive:person:1", `a-${tag}@example.test`), item("pipedrive:person:2", `b-${tag}@example.test`, "cold")];
    expect(await importer.applyImport(db, studioId, leads)).toEqual({ created: 2, alreadyImported: 0, matchedExisting: 0 });
    expect(await importer.applyImport(db, studioId, leads)).toEqual({ created: 0, alreadyImported: 2, matchedExisting: 0 });

    const rows = await db.select().from(schema.lead).where(eq(schema.lead.studioId, studioId));
    expect(rows).toHaveLength(2);
    const cold = rows.find((r) => r.externalRef === "pipedrive:person:2")!;
    expect(cold).toMatchObject({ stage: "cold", coldReason: "other", createdAt: new Date("2026-09-01T08:00:00Z") });
    const events = await db.select().from(schema.leadEvent).where(eq(schema.leadEvent.leadId, cold.id));
    expect(events).toMatchObject([{ toStage: "cold", via: "pipedrive" }]);
    const notes = await db.select().from(schema.leadNote).where(eq(schema.leadNote.leadId, cold.id));
    expect(notes).toHaveLength(1);
  });

  it("skips someone the CRM already has a lead for", async () => {
    const leads = await import("@/lib/leads/service");
    const email = `c-${tag}@example.test`;
    await leads.createOrMatchLead(db, studioId, { name: "Redan här", email, source: "manual" });
    expect(await importer.applyImport(db, studioId, [item("pipedrive:person:3", email.toUpperCase())])).toEqual({
      created: 0,
      alreadyImported: 0,
      matchedExisting: 1,
    });
  });
});
