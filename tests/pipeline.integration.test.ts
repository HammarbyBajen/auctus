import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("pipeline stages and contact log", () => {
  const tag = `pipe-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let service: typeof import("@/lib/leads/service");
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let counter = 0;

  async function newLead(studioId = studioA) {
    counter += 1;
    const { lead } = await service.createOrMatchLead(db, studioId, {
      name: `Person ${counter}`,
      email: `person${counter}-${tag}@example.test`,
      source: "manual",
    });
    return lead;
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    service = await import("@/lib/leads/service");
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
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(inArray(schema.lead.studioId, [studioA, studioB]));
    await db.delete(schema.person).where(inArray(schema.person.studioId, [studioA, studioB]));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("gives a new studio the default stages in order, and running it twice changes nothing", async () => {
    const { ensureDefaultPipeline, listStages, listColdReasons } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioA);
    const stages = await listStages(db, studioA);
    expect(stages.map((s) => s.key)).toEqual([
      "new_lead",
      "contacted",
      "booked_meeting",
      "booked_test_training",
      "consultation_done",
      "price_info",
      "won",
      "cold",
    ]);
    expect(stages.find((s) => s.key === "cold")?.kind).toBe("cold");
    expect((await listColdReasons(db, studioA)).length).toBeGreaterThan(3);
  });

  it("moves a lead to any stage and records who and when", async () => {
    const lead = await newLead();
    const [author] = await db.select().from(schema.user).limit(1);
    await service.moveLeadStage(db, studioA, lead.id, "price_info", { authorId: author?.id ?? null });
    const found = await service.getLead(db, studioA, lead.id);
    expect(found?.stage.key).toBe("price_info");
    const move = found?.history[0];
    expect(move?.kind).toBe("stage_changed");
    if (move?.kind === "stage_changed") {
      expect(move.fromStage).toBe("new_lead");
      expect(move.toStage).toBe("price_info");
      expect(move.at).toBeInstanceOf(Date);
      expect(move.authorName).toBe(author?.name ?? null);
    }
  });

  it("does nothing, and records nothing, when moving to the stage it is already in", async () => {
    const lead = await newLead();
    await service.moveLeadStage(db, studioA, lead.id, "new_lead");
    expect((await service.getLead(db, studioA, lead.id))?.history).toHaveLength(0);
  });

  it("refuses an unknown stage", async () => {
    const lead = await newLead();
    await expect(service.moveLeadStage(db, studioA, lead.id, "nope")).rejects.toMatchObject({
      code: "unknown_stage",
    });
  });

  it("requires a reason to mark a lead cold, and rejects an unknown reason", async () => {
    const lead = await newLead();
    await expect(service.moveLeadStage(db, studioA, lead.id, "cold")).rejects.toMatchObject({
      code: "cold_reason_required",
    });
    await expect(
      service.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "made-up" }),
    ).rejects.toMatchObject({ code: "cold_reason_required" });
    expect((await service.getLead(db, studioA, lead.id))?.stage.key).toBe("new_lead");

    await service.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "price" });
    const found = await service.getLead(db, studioA, lead.id);
    expect(found?.stage.key).toBe("cold");
    expect(found?.lead.coldReason).toBe("price");
  });

  it("reopens a cold lead, clears its reason and keeps the history", async () => {
    const lead = await newLead();
    await service.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "no_response" });
    await service.moveLeadStage(db, studioA, lead.id, "contacted");
    const found = await service.getLead(db, studioA, lead.id);
    expect(found?.stage.key).toBe("contacted");
    expect(found?.lead.coldReason).toBeNull();
    const moves = found?.history.filter((h) => h.kind === "stage_changed") ?? [];
    expect(moves).toHaveLength(2);
    const cold = moves.find((m) => m.kind === "stage_changed" && m.toStage === "cold");
    expect(cold?.kind === "stage_changed" && cold.coldReason).toBe("no_response");
  });

  it("can set Won by hand", async () => {
    const lead = await newLead();
    await service.moveLeadStage(db, studioA, lead.id, "won");
    expect((await service.getLead(db, studioA, lead.id))?.stage.kind).toBe("won");
  });

  it("logs a contact with one call and moves a new lead on to contacted", async () => {
    const lead = await newLead();
    await service.logContact(db, studioA, lead.id, "no_answer", null);
    const found = await service.getLead(db, studioA, lead.id);
    expect(found?.stage.key).toBe("contacted");
    const kinds = found?.history.map((h) => h.kind).sort();
    expect(kinds).toEqual(["contact_logged", "stage_changed"]);
    const contact = found?.history.find((h) => h.kind === "contact_logged");
    expect(contact?.kind === "contact_logged" && contact.outcome).toBe("no_answer");
  });

  it("logs a contact without changing a stage that is already past the first", async () => {
    const lead = await newLead();
    await service.moveLeadStage(db, studioA, lead.id, "price_info");
    await service.logContact(db, studioA, lead.id, "called", null);
    const found = await service.getLead(db, studioA, lead.id);
    expect(found?.stage.key).toBe("price_info");
  });

  it("refuses an unknown contact outcome", async () => {
    const lead = await newLead();
    await expect(service.logContact(db, studioA, lead.id, "smoke-signal", null)).rejects.toMatchObject({
      code: "unknown_outcome",
    });
  });

  it("will not touch another studio's lead", async () => {
    const lead = await newLead(studioB);
    await expect(service.moveLeadStage(db, studioA, lead.id, "won")).rejects.toMatchObject({ code: "not_found" });
    await expect(service.logContact(db, studioA, lead.id, "called", null)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await service.getLead(db, studioB, lead.id))?.stage.key).toBe("new_lead");
    const rows = await db.select().from(schema.leadEvent).where(eq(schema.leadEvent.leadId, lead.id));
    expect(rows).toHaveLength(0);
  });

  it("the database refuses a lead in a stage that does not exist", async () => {
    const lead = await newLead();
    await expect(
      db.update(schema.lead).set({ stage: "made-up" }).where(eq(schema.lead.id, lead.id)),
    ).rejects.toThrow();
  });
});
