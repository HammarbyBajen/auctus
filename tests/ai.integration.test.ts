import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { AiTransport } from "@/lib/ai/client";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("the assistant's foundation (ticket 30)", () => {
  const tag = `ai-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let ai: typeof import("@/lib/ai/client");
  let tools: typeof import("@/lib/ai/tools");
  let leads: typeof import("@/lib/leads/service");
  const key = process.env.ANTHROPIC_API_KEY;

  const owner = () => ({ id: ownerId, studioId, role: "owner" });
  const request = { system: "Svara kort.", prompt: "Hej", schema: z.object({ answer: z.string() }) };
  type Reply = { output: unknown; model?: string; refused?: boolean };
  const fake = (over: Reply = { output: { answer: "ok" } }): AiTransport & { calls: number } => {
    const t = {
      calls: 0,
      async complete<T>() {
        t.calls += 1;
        return {
          output: over.output as T | null,
          model: over.model ?? "claude-haiku-5-5",
          refused: over.refused ?? false,
          usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
        };
      },
    };
    return t;
  };

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    ai = await import("@/lib/ai/client");
    tools = await import("@/lib/ai/tools");
    leads = await import("@/lib/leads/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "AI" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
  });

  afterEach(() => {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("sends nothing without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const transport = fake();
    expect(await ai.askAi(db, { studioId, userId: ownerId, kind: "test" }, request, transport)).toEqual({ status: "not_configured" });
    expect(transport.calls).toBe(0);
  });

  it("logs each call with what it cost and what it suggested", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
    const result = await ai.askAi(db, { studioId, userId: ownerId, kind: "test" }, request, fake());
    expect(result).toMatchObject({ status: "ok", output: { answer: "ok" } });
    const [row] = await db.select().from(schema.aiSuggestion).where(eq(schema.aiSuggestion.id, (result as { suggestionId: string }).suggestionId));
    // Haiku 5.5: 1,000 input at $0.10/M and 200 output at $0.50/M = $0.0002, 200 millionths.
    expect(row).toMatchObject({ status: "ok", model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200, costMicroUsd: 200, suggestion: { answer: "ok" } });
    await ai.decideSuggestion(db, studioId, row.id, "accepted", ownerId);
    const [decided] = await db.select().from(schema.aiSuggestion).where(eq(schema.aiSuggestion.id, row.id));
    expect(decided.decision).toBe("accepted");
  });

  it("stops at the month's cap without calling the AI, and logs that", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
    await db.update(schema.studioSettings).set({ aiSettings: { monthlyBudgetUsd: 0.0001 } }).where(eq(schema.studioSettings.studioId, studioId));
    const transport = fake();
    const result = await ai.askAi(db, { studioId, userId: ownerId, kind: "test" }, request, transport);
    expect(result.status).toBe("over_budget");
    expect(transport.calls).toBe(0);
    await db.update(schema.studioSettings).set({ aiSettings: null }).where(eq(schema.studioSettings.studioId, studioId));
  });

  it("records a refusal or an error as failed, without the key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
    expect((await ai.askAi(db, { studioId, userId: ownerId, kind: "test" }, request, fake({ refused: true, output: null }))).status).toBe("failed");
    const broken: AiTransport = { complete: async () => Promise.reject(new Error("overloaded")) };
    const result = await ai.askAi(db, { studioId, userId: ownerId, kind: "test" }, request, broken);
    const [row] = await db.select().from(schema.aiSuggestion).where(eq(schema.aiSuggestion.id, (result as { suggestionId: string }).suggestionId));
    expect([row.status, row.error]).toEqual(["failed", "overloaded"]);
  });

  it("shows the AI a lead without contact details, health notes or private notes", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Anna Andersson", email: `anna-${tag}@example.test`, phone: "070-111 22 33", source: "contact_form" });
    await db.insert(schema.leadSubmission).values({
      studioId, senderId: `${tag}-s`, route: "qualification", isTest: false, outcome: "created", leadId: lead.id,
      payload: { answers: { mål: "Styrka", erfarenhet: "Nybörjare", hälsa: "Ont i ryggen" }, landingPage: "https://crossfittegen.se/prova?fbclid=abc" },
    });
    await leads.addNote(db, studioId, lead.id, "Ringde, nås på 070-111 22 33", ownerId);
    await leads.addNote(db, studioId, lead.id, "Har ont i knät, hör av sig om två veckor", ownerId);
    const [privateNote] = await db.insert(schema.leadNote).values({ studioId, leadId: lead.id, body: "Personlig sak", authorId: ownerId, private: true }).returning();
    expect(privateNote.private).toBe(true);

    const seen = await tools.leadContext(db, owner(), lead.id);
    const text = JSON.stringify(seen);
    expect(seen).toMatchObject({ firstName: "Anna", stage: "Ny lead", notesHeldBack: 2, form: { route: "qualification", answers: { mål: "Styrka", erfarenhet: "Nybörjare" }, page: "/prova" } });
    expect(seen.notes.map((n) => n.body)).toEqual(["Ringde, nås på [telefon]"]);
    for (const secret of ["Andersson", "example.test", "111 22 33", "knät", "ryggen", "Personlig", "fbclid"]) expect(text).not.toContain(secret);
  });

  it("carries out approved steps as the person who approved them, and refuses without the right", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Bo", email: `bo-${tag}@example.test`, source: "manual" });
    await tools.applySteps(db, owner(), lead.id, [
      { type: "log_contact", outcome: "called" },
      { type: "add_note", body: "Vill testa på torsdag" },
      { type: "create_task", title: "Boka provträning", dueDate: "2026-10-23" },
      { type: "move_stage", stage: "contacted", coldReason: null },
    ]);
    const found = await leads.getLead(db, studioId, lead.id);
    expect(found?.lead.stage).toBe("contacted");
    expect(found?.history.map((h) => h.kind).sort()).toEqual(["contact_logged", "note", "stage_changed"]);
    const tasks = await db.select().from(schema.task).where(eq(schema.task.leadId, lead.id));
    expect(tasks.map((t) => [t.title, t.dueDate])).toEqual([["Boka provträning", "2026-10-23"]]);

    await expect(tools.applySteps(db, { ...owner(), role: null }, lead.id, [{ type: "add_note", body: "x" }])).rejects.toMatchObject({ code: "not_allowed" });
    await expect(tools.applySteps(db, owner(), lead.id, [{ type: "move_stage", stage: "no_such_stage", coldReason: null }])).rejects.toThrow();
  });
});
