import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("leads", () => {
  const tag = `leads-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let service: typeof import("@/lib/leads/service");
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    service = await import("@/lib/leads/service");
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
    // Leads (and their notes) first: the database refuses to delete a studio that still has leads.
    await db.delete(schema.lead).where(inArray(schema.lead.studioId, [studioA, studioB]));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("creates a lead in the first stage with its source", async () => {
    const { lead, duplicate } = await service.createOrMatchLead(db, studioA, {
      name: "Anna Svensson",
      email: "anna@example.test",
      phone: "070-111 22 33",
      source: "contact_form",
    });
    expect(duplicate).toBe(false);
    expect(lead.stage).toBe("new_lead");
    expect(lead.source).toBe("contact_form");
    expect(lead.name).toBe("Anna Svensson");
  });

  it("adds to the existing lead when the email matches, ignoring case", async () => {
    const first = await service.createOrMatchLead(db, studioA, {
      name: "Bo Berg",
      email: "bo@example.test",
      source: "manual",
    });
    const again = await service.createOrMatchLead(db, studioA, {
      name: "Bo B",
      email: "  BO@Example.test ",
      phone: "0702223344",
      source: "chat_bot",
    });
    expect(again.duplicate).toBe(true);
    expect(again.lead.id).toBe(first.lead.id);
    // The missing phone number is filled in, the name and source stay.
    expect(again.lead.phone).toBe("0702223344");
    expect(again.lead.name).toBe("Bo Berg");
    expect(again.lead.source).toBe("manual");
    const found = await service.getLead(db, studioA, first.lead.id);
    expect(found?.notes).toHaveLength(1);
    expect(found?.notes[0].body).toContain("Bo B");
  });

  it("matches on phone when written in a different way", async () => {
    const first = await service.createOrMatchLead(db, studioA, {
      name: "Cia Carlsson",
      phone: "070-555 66 77",
      source: "manual",
    });
    const again = await service.createOrMatchLead(db, studioA, {
      name: "Cia",
      phone: "+46 70 555 66 77",
      source: "manual",
    });
    expect(again.duplicate).toBe(true);
    expect(again.lead.id).toBe(first.lead.id);
  });

  it("creates two leads when neither email nor phone match", async () => {
    const a = await service.createOrMatchLead(db, studioA, { name: "D1", email: "d1@example.test", source: "manual" });
    const b = await service.createOrMatchLead(db, studioA, { name: "D2", email: "d2@example.test", source: "manual" });
    expect(a.lead.id).not.toBe(b.lead.id);
  });

  it("lists leads newest first and keeps studios apart", async () => {
    const other = await service.createOrMatchLead(db, studioB, {
      name: "Annan studio",
      email: "anna@example.test",
      source: "manual",
    });
    // The same email in another studio is a different lead, not a duplicate.
    expect(other.duplicate).toBe(false);

    const listA = await service.listLeads(db, studioA);
    const times = listA.map((l) => l.createdAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(listA.every((l) => l.studioId === studioA)).toBe(true);
    expect(listA.find((l) => l.id === other.lead.id)).toBeUndefined();
    expect(await service.getLead(db, studioA, other.lead.id)).toBeNull();
  });

  it("adds notes to a lead, newest first, and refuses another studio's lead", async () => {
    const { lead } = await service.createOrMatchLead(db, studioA, { name: "Eva", email: "eva@example.test", source: "manual" });
    await service.addNote(db, studioA, lead.id, "Första", null);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.addNote(db, studioA, lead.id, "Andra", null);
    const found = await service.getLead(db, studioA, lead.id);
    expect(found?.notes.map((n) => n.body)).toEqual(["Andra", "Första"]);
    expect(await service.addNote(db, studioB, lead.id, "Fel studio", null)).toBeNull();
    expect(
      (await db.select().from(schema.leadNote).where(eq(schema.leadNote.leadId, lead.id))).length,
    ).toBe(2);
  });
});
