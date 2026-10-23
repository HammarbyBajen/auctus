import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiTransport } from "@/lib/ai/client";
import { withoutName } from "@/lib/ai/drafts";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("withoutName", () => {
  it("swaps every part of a name for [namn], whole words only, any case", () => {
    expect(withoutName("Hej Klara! Klara Karlsson, välkommen. KLARA", "Klara Karlsson")).toBe("Hej [namn]! [namn] [namn], välkommen. [namn]");
    expect(withoutName("Klarade passet", "Klara")).toBe("Klarade passet");
    expect(withoutName("Hej!", null)).toBe("Hej!");
  });
});

describe.skipIf(!hasDb)("email drafts from the assistant (ticket 30, phase D)", () => {
  const tag = `aid-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let drafts: typeof import("@/lib/ai/drafts");
  let leads: typeof import("@/lib/leads/service");
  const key = process.env.ANTHROPIC_API_KEY;
  const actor = () => ({ id: ownerId, studioId, role: "owner" });

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
  const email = (over: Partial<typeof schema.emailMessage.$inferInsert>) => ({
    studioId,
    to: `x-${tag}@example.test`,
    subject: "Hej",
    body: "Hej",
    mode: "test",
    status: "sent",
    sentById: ownerId,
    ...over,
  });

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    drafts = await import("@/lib/ai/drafts");
    leads = await import("@/lib/leads/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "AI D" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Fredrik Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
  });

  afterAll(async () => {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
    await db.delete(schema.emailMessage).where(eq(schema.emailMessage.studioId, studioId));
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("learns the tone from earlier emails, without anyone's name, contact details or health", async () => {
    const { lead: earlier } = await leads.createOrMatchLead(db, studioId, { name: "Sara Svensson", email: `sara-${tag}@example.test`, source: "manual" });
    const { lead: sick } = await leads.createOrMatchLead(db, studioId, { name: "Olle", email: `olle-${tag}@example.test`, source: "manual" });
    await db.insert(schema.emailMessage).values([
      email({ leadId: earlier.id, subject: "Välkommen Sara", body: "Hej Sara!\n\nKul att du hörde av dig. Ring mig på 070-111 22 33.\n\nHälsningar Fredrik", createdAt: new Date(Date.now() - 3000) }),
      email({ leadId: sick.id, subject: "Krya på dig", body: "Hej Olle, hoppas knäskadan läker fint.", createdAt: new Date(Date.now() - 2000) }),
      // Written by no one on the staff (an automatic email): not an example.
      email({ leadId: earlier.id, subject: "Auto", body: "Automatiskt svar", sentById: null }),
    ]);
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Klara Karlsson", email: `klara-${tag}@example.test`, phone: "070-555 44 33", source: "contact_form" });
    const answer = { subject: "Provträning?", body: "Hej Klara!\n\nVill du komma på en provträning?\n\nFredrik" };
    const { transport, sent } = fake(answer);
    const result = await drafts.draftLeadEmail(db, actor(), lead.id, { subject: "", body: "" }, "Fredrik Ägare", transport);
    expect(result).toMatchObject({ status: "ok", output: answer });

    const prompt = JSON.parse(sent[0].prompt);
    expect(prompt.sender).toBe("Fredrik");
    expect(prompt.examples).toEqual([{ subject: "Välkommen [namn]", body: "Hej [namn]!\n\nKul att du hörde av dig. Ring mig på [telefon].\n\nHälsningar Fredrik" }]);
    for (const secret of ["Karlsson", "example.test", "555 44 33", "Sara", "knäskada", "Automatiskt"]) expect(sent[0].prompt).not.toContain(secret);

    const [log] = await db.select().from(schema.aiSuggestion).where(eq(schema.aiSuggestion.id, (result as { suggestionId: string }).suggestionId));
    expect(log).toMatchObject({ kind: "email_draft", leadId: lead.id, status: "ok" });
  });

  it("builds on what the person already wrote, unless it shows health information", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Nils", email: `nils-${tag}@example.test`, source: "manual" });
    const { transport, sent } = fake({ subject: "Hej", body: "Hej Nils" });
    await drafts.draftLeadEmail(db, actor(), lead.id, { subject: "Provpass", body: "Hej Nils, mejla nils@example.se" }, "Fredrik", transport);
    expect(JSON.parse(sent[0].prompt).draft).toEqual({ subject: "Provpass", body: "Hej Nils, mejla [e-post]" });
    await drafts.draftLeadEmail(db, actor(), lead.id, { subject: "Rehab", body: "Hur går rehaben?" }, "Fredrik", transport);
    expect(JSON.parse(sent[1].prompt).draft).toBeNull();
  });

  it("does nothing without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Ingen", email: `ingen-${tag}@example.test`, source: "manual" });
    expect(await drafts.draftLeadEmail(db, actor(), lead.id, { subject: "", body: "" }, "Fredrik")).toEqual({ status: "not_configured" });
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
  });
});
