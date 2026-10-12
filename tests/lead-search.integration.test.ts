import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LeadFilters } from "@/lib/leads/search";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("lead search", () => {
  const tag = `search-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let search: typeof import("@/lib/leads/search");
  const none: LeadFilters = { q: "", stage: "", source: "", assignee: "", period: "" };
  const names = async (studioId: string, f: Partial<LeadFilters>) =>
    (await search.searchLeads(db, studioId, { ...none, ...f }, ownerId)).map((r) => r.person.name).sort();

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    search = await import("@/lib/leads/search");
    const leads = await import("@/lib/leads/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const { assignLead } = await import("@/lib/tasks/service");
    const rows = await db.insert(schema.studio).values([{ slug: `${tag}-a`, name: "A" }, { slug: `${tag}-b`, name: "B" }]).returning();
    [studioA, studioB] = rows.map((r) => r.id);
    await ensureDefaultPipeline(db, studioA);
    await ensureDefaultPipeline(db, studioB);
    [{ id: ownerId }] = await db
      .insert(schema.user)
      .values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId: studioA })
      .returning();

    const add = async (studioId: string, name: string, email: string | null, phone: string | null, source = "contact_form") =>
      (await leads.createOrMatchLead(db, studioId, { name, email, phone, source: source as never })).lead;
    const asa = await add(studioA, "Åsa Öberg", `asa-${tag}@example.test`, "070-123 45 67");
    const bo = await add(studioA, "Bo 100% Bergström", `bo-${tag}@example.test`, null, "chat_bot");
    const cold = await add(studioA, "Cecilia Kall", null, "+46 73 999 88 77");
    await add(studioB, "Åsa Annan", `other-${tag}@example.test`, "0701234567");
    await leads.moveLeadStage(db, studioA, cold.id, "cold", { coldReason: "other" });
    await assignLead(db, studioA, bo.id, ownerId);
    await db.update(schema.lead).set({ createdAt: new Date(Date.now() - 60 * 86_400_000) }).where(eq(schema.lead.id, asa.id));
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(inArray(schema.lead.studioId, [studioA, studioB]));
    await db.delete(schema.person).where(inArray(schema.person.studioId, [studioA, studioB]));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("matches part of a name, ignoring case, Swedish letters included", async () => {
    expect(await names(studioA, { q: "åsa" })).toEqual(["Åsa Öberg"]);
    expect(await names(studioA, { q: "BERG" })).toEqual(["Bo 100% Bergström", "Åsa Öberg"]);
  });

  it("matches part of an email, and a phone number however it is written", async () => {
    expect(await names(studioA, { q: `bo-${tag}` })).toEqual(["Bo 100% Bergström"]);
    expect(await names(studioA, { q: "0701234567" })).toEqual(["Åsa Öberg"]);
    expect(await names(studioA, { q: "+46 70 123 45 67" })).toEqual(["Åsa Öberg"]);
    expect(await names(studioA, { q: "99 88" })).toEqual(["Cecilia Kall"]);
  });

  it("takes % and _ in the search literally", async () => {
    expect(await names(studioA, { q: "100%" })).toEqual(["Bo 100% Bergström"]);
    expect(await names(studioA, { q: "%" })).toEqual(["Bo 100% Bergström"]);
  });

  it("finds cold leads too, and combines filters", async () => {
    expect(await names(studioA, { stage: "cold" })).toEqual(["Cecilia Kall"]);
    expect(await names(studioA, { source: "chat_bot" })).toEqual(["Bo 100% Bergström"]);
    expect(await names(studioA, { assignee: "mine" })).toEqual(["Bo 100% Bergström"]);
    expect(await names(studioA, { assignee: "none" })).toEqual(["Cecilia Kall", "Åsa Öberg"]);
    expect(await names(studioA, { period: "30" })).toEqual(["Bo 100% Bergström", "Cecilia Kall"]);
    expect(await names(studioA, { q: "berg", period: "30" })).toEqual(["Bo 100% Bergström"]);
  });

  it("never returns another studio's leads", async () => {
    expect(await names(studioA, { q: "Annan" })).toEqual([]);
    expect(await names(studioB, { q: "åsa" })).toEqual(["Åsa Annan"]);
  });

  it("lists the sources a studio's leads actually have", async () => {
    expect(await search.usedSources(db, studioA)).toEqual(["chat_bot", "contact_form"]);
  });
});
