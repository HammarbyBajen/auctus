import { and, eq } from "drizzle-orm";
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
  const userId = `${tag}-u`;

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
    await db.insert(schema.user).values({ id: userId, name: "Personal", email: `${userId}@example.test`, emailVerified: true, role: "owner", studioId });
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
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

  it("replaces every imported lead with a new export, keeping leads made in Tegen HQ", async () => {
    // From the tests above: two imported leads (1, 2) and one made by hand (c-).
    const before = await importer.previewReplace(db, studioId);
    expect(before).toEqual({ leads: 2, persons: 2, kept: 1, worked: 0 });

    const fresh = [item("pipedrive:person:1", `a-${tag}@example.test`, "cold"), item("pipedrive:person:4", `d-${tag}@example.test`)];
    const result = await importer.replaceImport(db, studioId, fresh);
    expect(result).toEqual({ removed: before, imported: { created: 2, alreadyImported: 0, matchedExisting: 0 } });

    const rows = await db.select().from(schema.lead).where(eq(schema.lead.studioId, studioId));
    expect(rows.map((r) => [r.externalRef, r.stage]).sort()).toEqual([
      [null, "new_lead"],
      ["pipedrive:person:1", "cold"],
      ["pipedrive:person:4", "new_lead"],
    ]);
    // Person 2 is gone with their lead; the hand-made one is untouched.
    const people = await db.select({ email: schema.person.email }).from(schema.person).where(eq(schema.person.studioId, studioId));
    expect(people.map((p) => p.email).sort()).toEqual([`a-${tag}@example.test`, `c-${tag}@example.test`, `d-${tag}@example.test`]);
  });

  it("refuses to replace once staff have worked on an imported lead, unless forced", async () => {
    const [imported] = await db.select().from(schema.lead).where(and(eq(schema.lead.studioId, studioId), eq(schema.lead.externalRef, "pipedrive:person:1")));
    const [note] = await db.insert(schema.leadNote).values({ studioId, leadId: imported.id, body: "Ringde, återkommer", authorId: userId }).returning();
    expect((await importer.previewReplace(db, studioId)).worked).toBe(1);
    const fresh = [item("pipedrive:person:1", `a-${tag}@example.test`, "cold"), item("pipedrive:person:4", `d-${tag}@example.test`)];
    await expect(importer.replaceImport(db, studioId, fresh)).rejects.toMatchObject({ code: "worked_on", count: 1 });
    // Nothing changed: the note is still there.
    expect(await db.select().from(schema.leadNote).where(eq(schema.leadNote.id, note.id))).toHaveLength(1);
    await db.delete(schema.leadNote).where(eq(schema.leadNote.id, note.id));
  });

  it("changes nothing when the new import fails partway", async () => {
    const before = await db.select({ id: schema.lead.id }).from(schema.lead).where(eq(schema.lead.studioId, studioId));
    const broken = [item("pipedrive:person:5", `e-${tag}@example.test`), { ...item("pipedrive:person:6", `f-${tag}@example.test`), createdAt: new Date("not a date") }];
    await expect(importer.replaceImport(db, studioId, broken)).rejects.toThrow();
    const after = await db.select({ id: schema.lead.id }).from(schema.lead).where(eq(schema.lead.studioId, studioId));
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
  });
});
