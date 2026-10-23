import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiTransport } from "@/lib/ai/client";
import { weekStart as weekStartFor } from "@/lib/ai/facts";
import { summaryMessage } from "@/lib/ai/owner";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("the weekly summary's text", () => {
  it("has the points, what to do, and a link, under Discord's limit", () => {
    const text = summaryMessage({ headline: "En lugn vecka.", points: ["4 nya leads"], watch: ["Ring Anna"] }, "2026-10-19");
    expect(text).toContain("**Veckan som gick (vecka från 2026-10-19)**");
    expect(text).toContain("• 4 nya leads");
    expect(text).toContain("**Den här veckan**\n• Ring Anna");
    expect(summaryMessage({ headline: "x", points: ["y".repeat(3000)], watch: [] }, "2026-10-19").length).toBeLessThanOrEqual(1990);
  });
  it("knows which day a week starts", () => {
    expect(weekStartFor("2026-10-26")).toBe("2026-10-26");
    expect(weekStartFor("2026-10-25")).toBe("2026-10-19");
  });
});

describe.skipIf(!hasDb)("owners' questions and the weekly summary (ticket 30, phase E)", () => {
  const tag = `aie-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let owner: typeof import("@/lib/ai/owner");
  let leads: typeof import("@/lib/leads/service");
  const key = process.env.ANTHROPIC_API_KEY;

  const fake = (output: unknown) => {
    const sent: { system: string; prompt: string }[] = [];
    const transport: AiTransport = {
      async complete<T>(model: string, request: { system: string; prompt: string }) {
        sent.push({ system: request.system, prompt: request.prompt });
        return { output: output as T, model, refused: false, parts: [{ model, usage: { inputTokens: 900, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } }] };
      },
    };
    return { transport, sent };
  };

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    owner = await import("@/lib/ai/owner");
    leads = await import("@/lib/leads/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "AI E" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Fredrik", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: "Anna Andersson", email: `anna-${tag}@example.test`, phone: "070-123 45 67", source: "contact_form" });
    await db.update(schema.lead).set({ attributionParsed: { campaign: "host-2026", utmSource: "meta" } }).where(eq(schema.lead.id, lead.id));
    await leads.moveLeadStage(db, studioId, lead.id, "cold", { coldReason: "price" });
    const hb = await import("@/lib/handbook/service");
    const cat = await hb.createCategory(db, studioId, "Öppna och stänga");
    await hb.createPage(db, studioId, ownerId, { title: "Stänga", categoryId: cat.id, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lås dörren. Larmkod hos Fredrik 070-999 88 77." }] }] } });
  });

  afterAll(async () => {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
    await db.delete(schema.handbookPage).where(eq(schema.handbookPage.studioId, studioId));
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("answers an owner from Tegen HQ's figures: campaigns, reasons, Handbok; first names only", async () => {
    const answer = { answer: "1 lead från host-2026, ingen blev medlem.", figures: [{ label: "Leads", value: "1" }], basis: "Kampanjsiffrorna.", unsure: false };
    const { transport, sent } = fake(answer);
    const result = await owner.askOwnerQuestion(db, { id: ownerId, studioId, role: "owner" }, "Hur gick höstkampanjen?", transport);
    expect(result).toMatchObject({ status: "ok", output: answer });
    const prompt = JSON.parse(sent[0].prompt);
    expect(prompt.question).toBe("Hur gick höstkampanjen?");
    expect(prompt.figures.leads.campaigns).toEqual([{ campaign: "host-2026", source: "meta", leads: 1, joined: 0, cold: 1, open: 0 }]);
    expect(Object.values(prompt.figures.leads.wentColdByMonthAndReason)[0]).toEqual({ Pris: 1 });
    expect(prompt.figures.handbook).toEqual([{ title: "Stänga", category: "Öppna och stänga", text: "Lås dörren. Larmkod hos Fredrik [telefon]." }]);
    expect(prompt.figures.leads.lastWeek).toBeDefined();
    for (const secret of ["Andersson", "example.test", "123 45 67", "999 88 77"]) expect(sent[0].prompt).not.toContain(secret);
    const [log] = await db.select().from(schema.aiSuggestion).where(eq(schema.aiSuggestion.id, (result as { suggestionId: string }).suggestionId));
    expect(log.kind).toBe("owner_question");
  });

  it("is for owners only", async () => {
    const { transport } = fake({});
    await expect(owner.askOwnerQuestion(db, { id: ownerId, studioId, role: "staff" }, "Intäkter?", transport)).rejects.toThrow("not_allowed");
  });

  it("posts the week's summary once, on Mondays only", async () => {
    const summary = { headline: "En lugn vecka.", points: ["1 ny lead från kontaktformuläret"], watch: [] };
    const { transport, sent } = fake(summary);
    const posts: string[] = [];
    const post = async (content: string) => {
      posts.push(content);
      return "sent" as const;
    };
    expect(await owner.postWeeklySummary(db, studioId, new Date("2026-10-25T05:00:00Z"), post, transport)).toBe("not_monday");
    const monday = new Date("2026-10-26T05:00:00Z");
    expect(await owner.postWeeklySummary(db, studioId, monday, post, transport)).toBe("sent");
    expect(await owner.postWeeklySummary(db, studioId, monday, post, transport)).toBe("already_sent");
    expect(sent).toHaveLength(1);
    expect(posts[0]).toContain("vecka från 2026-10-19");
    delete process.env.ANTHROPIC_API_KEY;
    expect(await owner.postWeeklySummary(db, studioId, new Date("2026-11-02T05:00:00Z"), post, transport)).toBe("not_configured");
    process.env.ANTHROPIC_API_KEY = "sk-test-only";
  });
});
