import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AiTransport } from "@/lib/ai/client";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("the assistant on the lead page (ticket 30, phase B)", () => {
  const tag = `aib-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let assist: typeof import("@/lib/ai/assist");
  let brief: typeof import("@/lib/ai/brief");
  let leads: typeof import("@/lib/leads/service");
  const key = process.env.ANTHROPIC_API_KEY;
  const actor = () => ({ id: ownerId, studioId, role: "owner" });

  /** A stand-in for the AI: answers with `output` and remembers what it was sent. */
  const fake = (output: unknown) => {
    const sent: { system: string; prompt: string }[] = [];
    const transport: AiTransport = {
      async complete<T>(model: string, request: { system: string; prompt: string }) {
        sent.push({ system: request.system, prompt: request.prompt });
        return { output: output as T, model, refused: false, parts: [{ model, usage: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 } }] };
      },
    };
    return { transport, sent };
  };

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    assist = await import("@/lib/ai/assist");
    brief = await import("@/lib/ai/brief");
    leads = await import("@/lib/leads/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "AI B" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
  });

  afterAll(async () => {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("makes a brief from what may be sent, and shows it again until something happens on the lead", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Klara Karlsson", email: `klara-${tag}@example.test`, phone: "070-555 44 33", source: "contact_form" });
    const answer = { tldr: "Klara vill börja träna och kom via kontaktformuläret.", facts: [], nextStep: "Boka provträning" };
    const { transport, sent } = fake(answer);
    const result = await assist.callBrief(db, actor(), lead.id, transport);
    expect(result).toMatchObject({ status: "ok", output: answer });
    // What went out: the first name, never the surname, email or phone.
    expect(sent[0].prompt).toContain("Klara");
    for (const secret of ["Karlsson", "example.test", "555 44 33"]) expect(sent[0].prompt).not.toContain(secret);

    const [row] = await db.select().from(schema.lead).where(eq(schema.lead.id, lead.id));
    expect((await brief.latestBrief(db, studioId, lead.id, row.updatedAt))?.brief).toEqual(answer);
    // Something new on the lead: the old brief no longer stands.
    expect(await brief.latestBrief(db, studioId, lead.id, new Date(Date.now() + 1000))).toBeNull();
  });

  it("does not send a private note or one with health information, and says so", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Lisa", email: `lisa-${tag}@example.test`, source: "manual" });
    const { transport, sent } = fake({ steps: [], explanation: "" });
    expect(await assist.stepsFromNote(db, actor(), lead.id, { body: "Har ont i ryggen, ring nästa vecka", private: false }, transport)).toEqual({ status: "held_back" });
    expect(await assist.stepsFromNote(db, actor(), lead.id, { body: "Ring på fredag", private: true }, transport)).toEqual({ status: "held_back" });
    expect(sent).toHaveLength(0);
  });

  it("keeps only steps the studio can carry out", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Moa", email: `moa-${tag}@example.test`, source: "manual" });
    const { transport, sent } = fake({
      steps: [
        { type: "log_contact", outcome: "called" },
        { type: "add_note", body: "Vill testa på torsdag" },
        { type: "create_task", title: "Boka provträning", dueDate: "2026-10-23" },
        { type: "move_stage", stage: "contacted", coldReason: "price" },
        { type: "move_stage", stage: "no_such_stage", coldReason: null },
        { type: "move_stage", stage: "cold", coldReason: null },
      ],
      explanation: "Hon svarade och vill testa.",
    });
    const result = await assist.stepsFromNote(db, actor(), lead.id, { body: "Pratade med Moa, vill testa torsdag. Nås på 070-111 22 33", private: false }, transport);
    expect(result.status).toBe("ok");
    const steps = (result as { output: { steps: unknown[] } }).output.steps;
    expect(steps).toEqual([
      { type: "log_contact", outcome: "called" },
      { type: "add_note", body: "Vill testa på torsdag" },
      { type: "create_task", title: "Boka provträning", dueDate: "2026-10-23" },
      // A reason only goes with a Cold move; the unknown stage and the Cold move without a reason are dropped.
      { type: "move_stage", stage: "contacted", coldReason: null },
    ]);
    // The note went out without the phone number, with the stages to choose from.
    expect(sent[0].prompt).toContain("[telefon]");
    expect(sent[0].prompt).not.toContain("111 22 33");
    expect(sent[0].prompt).toContain("contacted");
  });
});
