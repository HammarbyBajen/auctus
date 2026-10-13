import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("editing stages, reasons and fields", () => {
  const tag = `pedit-${Date.now()}`;
  let studioId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let pipeline: typeof import("@/lib/pipeline/service");
  let leads: typeof import("@/lib/leads/service");
  let n = 0;
  const newLead = async () => {
    n++;
    return (await leads.createOrMatchLead(db, studioId, { name: `Lead ${n}`, email: `${n}-${tag}@example.test`, source: "manual" })).lead;
  };
  const keys = async () => (await pipeline.listStages(db, studioId)).map((s) => s.key);

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    pipeline = await import("@/lib/pipeline/service");
    leads = await import("@/lib/leads/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Edit" }).returning();
    await pipeline.ensureDefaultPipeline(db, studioId);
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("renames a stage without touching its key or its leads", async () => {
    const lead = await newLead();
    await pipeline.renameStage(db, studioId, "new_lead", "Nya intressenter");
    const [stage] = (await pipeline.listStages(db, studioId)).filter((s) => s.key === "new_lead");
    expect(stage.name).toBe("Nya intressenter");
    expect((await leads.getLead(db, studioId, lead.id))?.lead.stage).toBe("new_lead");
    await expect(pipeline.renameStage(db, studioId, "new_lead", "  ")).rejects.toThrow("invalid");
  });

  it("adds a stage before Medlem and Kall lead, and moves open stages up and down only among themselves", async () => {
    const key = await pipeline.addStage(db, studioId, "Väntar på svar");
    const order = await keys();
    expect(order.slice(-3)).toEqual([key, "won", "cold"]);
    await pipeline.moveStageOrder(db, studioId, key, "up");
    expect((await keys()).slice(-4)).toEqual([key, "price_info", "won", "cold"]);
    await pipeline.moveStageOrder(db, studioId, "price_info", "down"); // already last open stage: no change
    expect((await keys()).slice(-3)).toEqual(["price_info", "won", "cold"]);
  });

  it("never removes a stage the app relies on", async () => {
    for (const key of ["new_lead", "contacted", "booked_test_training", "won", "cold"]) {
      await expect(pipeline.removeStage(db, studioId, key)).rejects.toThrow("locked");
    }
  });

  it("removes a stage with leads only after moving them, keeping its name for history", async () => {
    const lead = await newLead();
    await leads.moveLeadStage(db, studioId, lead.id, "booked_meeting");
    await expect(pipeline.removeStage(db, studioId, "booked_meeting")).rejects.toThrow("has_leads");
    await expect(pipeline.removeStage(db, studioId, "booked_meeting", { moveTo: "cold" })).rejects.toThrow("has_leads");
    expect(await pipeline.removeStage(db, studioId, "booked_meeting", { moveTo: "contacted" })).toEqual({ moved: 1 });

    expect(await keys()).not.toContain("booked_meeting");
    const all = await pipeline.listStages(db, studioId, { includeArchived: true });
    expect(all.find((s) => s.key === "booked_meeting")?.name).toBe("Bokat möte");
    const found = await leads.getLead(db, studioId, lead.id);
    expect(found?.lead.stage).toBe("contacted");
    expect(found?.history.find((h) => h.kind === "stage_changed")).toMatchObject({ fromStage: "booked_meeting", toStage: "contacted", via: "settings" });
  });

  it("removes a Cold reason from the choices while leads keep it, but never the last one", async () => {
    const lead = await newLead();
    await leads.moveLeadStage(db, studioId, lead.id, "cold", { coldReason: "price" });
    await pipeline.removeColdReason(db, studioId, "price");
    expect((await pipeline.listColdReasons(db, studioId)).map((r) => r.key)).not.toContain("price");
    expect((await leads.getLead(db, studioId, lead.id))?.lead.coldReason).toBe("price");
    const added = await pipeline.addColdReason(db, studioId, "Flyttar");
    expect((await pipeline.listColdReasons(db, studioId)).at(-1)?.key).toBe(added);
    for (const r of (await pipeline.listColdReasons(db, studioId)).slice(1)) await pipeline.removeColdReason(db, studioId, r.key);
    const [last] = await pipeline.listColdReasons(db, studioId);
    await expect(pipeline.removeColdReason(db, studioId, last.key)).rejects.toThrow("locked");
  });

  it("adds custom fields, saves only valid values, and keeps values of a removed field", async () => {
    const goal = await pipeline.addLeadField(db, studioId, { label: "Mål", type: "text", options: [] });
    const interest = await pipeline.addLeadField(db, studioId, { label: "Intresse", type: "choice", options: pipeline.parseOptions("CrossFit\nKids\n\nCrossFit") });
    await expect(pipeline.addLeadField(db, studioId, { label: "Fel", type: "choice", options: ["Bara ett"] })).rejects.toThrow("invalid");

    const lead = await newLead();
    const form = new FormData();
    form.set(`field_${goal}`, "Gå ner 5 kg");
    form.set(`field_${interest}`, "Yoga"); // not one of the choices: ignored
    form.set("field_unknown", "x");
    await pipeline.saveLeadFieldValues(db, studioId, lead.id, form);
    let [row] = await db.select().from(schema.lead).where(eq(schema.lead.id, lead.id));
    expect(row.customFields).toEqual({ [goal]: "Gå ner 5 kg" });

    await pipeline.removeLeadField(db, studioId, goal);
    expect((await pipeline.listLeadFields(db, studioId)).map((f) => f.key)).toEqual([interest]);
    const again = new FormData();
    again.set(`field_${interest}`, "Kids");
    await pipeline.saveLeadFieldValues(db, studioId, lead.id, again);
    [row] = await db.select().from(schema.lead).where(and(eq(schema.lead.studioId, studioId), eq(schema.lead.id, lead.id)));
    expect(row.customFields).toEqual({ [goal]: "Gå ner 5 kg", [interest]: "Kids" });
  });
});
