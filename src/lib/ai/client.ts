import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, eq, gte, sql, sum } from "drizzle-orm";
import type { z } from "zod";
import { db as defaultDb } from "@/db";
import { aiSuggestion, studioSettings } from "@/db/schema";
import { startOfMonthInStockholm } from "@/lib/home/time";
import { aiEnabled } from "./enabled";

/**
 * The only place in Tegen HQ that talks to the AI provider (ticket 30; a lint
 * rule and a test keep it that way). The key is read here and nowhere else,
 * and never logged. Without a key nothing is sent and every call says so.
 *
 * Every call is checked against the studio's monthly cost cap first, then
 * logged in ai_suggestion with what it cost and what it suggested. A
 * suggestion is only ever a suggestion: acting on it is a person's choice
 * (src/lib/ai/tools.ts).
 */

type Db = typeof defaultDb;

/** The model unless AI_MODEL says otherwise. Which model to use is Max's call; measure on Tegen's own leads first. */
export const defaultModel = "claude-opus-5-5";
/** The monthly cap when the studio has not set one, in US dollars. */
export const defaultMonthlyBudgetUsd = 20;

/** US dollars per million tokens: input, output, cache read, cache write. Unknown models are priced high, to stay under the cap. */
const prices: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};
const unknownPrice: [number, number, number, number] = [10, 50, 1, 12.5];

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** What a call cost, in millionths of a US dollar. */
export function costMicroUsd(model: string, usage: AiUsage): number {
  const [input, output, cacheRead, cacheWrite] = prices[model] ?? unknownPrice;
  // Dollars per million tokens is the same number as millionths of a dollar per token.
  return Math.ceil(usage.inputTokens * input + usage.outputTokens * output + usage.cacheReadTokens * cacheRead + usage.cacheWriteTokens * cacheWrite);
}

/** Whether a key is set (the light check lives in ./enabled, for pages that should not load this module). */
export const hasAiKey = aiEnabled;
export const aiModel = () => process.env.AI_MODEL?.trim() || defaultModel;

export type AiRequest<T> = {
  /** Stable instructions for this kind of help; cached, so keep anything that changes out of it. */
  system: string;
  /** What this call is about: already filtered (src/lib/ai/privacy.ts). */
  prompt: string;
  schema: z.ZodType<T>;
  /** How hard the model thinks: low for quick sorting, medium for a brief, high for a hard question. */
  effort?: "low" | "medium" | "high";
};

/** One model's share of a call: a declined request and the fallback that rescued it are billed separately. */
export type AiPart = { model: string; usage: AiUsage };

export type AiTransport = {
  complete<T>(model: string, request: AiRequest<T>): Promise<{ output: T | null; model: string; parts: AiPart[]; refused: boolean }>;
};

/** The most a request can produce. */
const maxOutputTokens = 4000;

/** Anthropic's API through the official SDK. A declined request is retried on Anthropic's own fallback model. */
export function anthropicTransport(): AiTransport {
  return {
    async complete(model, request) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.beta.messages.parse({
        model,
        max_tokens: maxOutputTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.prompt }],
        output_config: { format: betaZodOutputFormat(request.schema), effort: request.effort ?? "medium" },
      });
      const usageOf = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): AiUsage => ({
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      });
      // With a fallback, each model that ran reports its own usage; both are billed.
      const iterations = (response.usage.iterations ?? []).filter((i): i is Extract<typeof i, { output_tokens: number }> => "output_tokens" in i);
      const parts: AiPart[] =
        iterations.length > 0
          ? iterations.map((i) => ({ model: ("model" in i && i.model) || model, usage: usageOf(i) }))
          : [{ model: response.model, usage: usageOf(response.usage) }];
      return { output: (response.parsed_output ?? null) as never, model: response.model, refused: response.stop_reason === "refusal", parts };
    },
  };
}

export type AiAbout = { studioId: string; userId: string | null; kind: string; leadId?: string | null; manaUserId?: string | null };

export type AiResult<T> =
  | { status: "ok"; suggestionId: string; output: T }
  | { status: "not_configured" }
  | { status: "over_budget"; spentUsd: number; budgetUsd: number }
  | { status: "failed"; suggestionId: string };

/** This calendar month's spend and the cap, in US dollars. */
export async function aiBudget(db: Db, studioId: string, now: Date = new Date()) {
  // One after the other: inside askAi's transaction they share one connection.
  const [spent] = await db
    .select({ micro: sum(aiSuggestion.costMicroUsd) })
    .from(aiSuggestion)
    .where(and(eq(aiSuggestion.studioId, studioId), gte(aiSuggestion.createdAt, startOfMonthInStockholm(now))));
  const [settings] = await db.select({ ai: studioSettings.aiSettings }).from(studioSettings).where(eq(studioSettings.studioId, studioId)).limit(1);
  return { spentUsd: Number(spent?.micro ?? 0) / 1_000_000, budgetUsd: settings?.ai?.monthlyBudgetUsd ?? defaultMonthlyBudgetUsd };
}

/** What a call can cost at most: its text (about 3 characters a token) and the most it can write. */
function worstCaseMicroUsd(model: string, request: AiRequest<unknown>): number {
  const inputTokens = Math.ceil((request.system.length + request.prompt.length) / 3);
  return costMicroUsd(model, { inputTokens, outputTokens: maxOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 });
}

/**
 * Asks the AI for one suggestion. Not sent without a key, or when the call
 * could take the month over its cap. Every call is logged: before it is sent
 * it reserves what it can cost at most (under a per-studio lock, so two calls
 * at once cannot both slip under the cap), and the real cost replaces that
 * when the answer comes back.
 */
export async function askAi<T>(db: Db, about: AiAbout, request: AiRequest<T>, transport: AiTransport = anthropicTransport(), now: Date = new Date()): Promise<AiResult<T>> {
  if (!hasAiKey()) return { status: "not_configured" };
  const model = aiModel();
  const row = { studioId: about.studioId, userId: about.userId, kind: about.kind, leadId: about.leadId ?? null, manaUserId: about.manaUserId ?? null, model };
  const reserve = worstCaseMicroUsd(model, request);

  const booked = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-budget:${about.studioId}`}))`);
    const { spentUsd, budgetUsd } = await aiBudget(tx as unknown as Db, about.studioId, now);
    if (spentUsd + reserve / 1_000_000 > budgetUsd) {
      await tx.insert(aiSuggestion).values({ ...row, status: "over_budget" });
      return { over: true as const, spentUsd, budgetUsd };
    }
    const [pending] = await tx.insert(aiSuggestion).values({ ...row, status: "pending", costMicroUsd: reserve }).returning({ id: aiSuggestion.id });
    return { over: false as const, id: pending.id };
  });
  if (booked.over) return { status: "over_budget", spentUsd: booked.spentUsd, budgetUsd: booked.budgetUsd };

  const finish = (values: Partial<typeof aiSuggestion.$inferInsert>) => db.update(aiSuggestion).set(values).where(eq(aiSuggestion.id, booked.id));
  try {
    const result = await transport.complete(model, request);
    const cost = result.parts.reduce((total, part) => total + costMicroUsd(part.model, part.usage), 0);
    const tokens = result.parts.reduce(
      (total, { usage }) => ({
        inputTokens: total.inputTokens + usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
        outputTokens: total.outputTokens + usage.outputTokens,
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
    if (result.refused || result.output === null) {
      await finish({ model: result.model, status: "failed", ...tokens, costMicroUsd: cost, error: result.refused ? "Modellen avböjde." : "Svaret gick inte att läsa." });
      return { status: "failed", suggestionId: booked.id };
    }
    await finish({ model: result.model, status: "ok", ...tokens, costMicroUsd: cost, suggestion: result.output as object });
    return { status: "ok", suggestionId: booked.id, output: result.output };
  } catch (error) {
    // Only what went wrong: never the key, the prompt or the person. The reservation stays as the cost: it may have been billed.
    const reason = error instanceof Error ? error.message.slice(0, 300) : "okänt fel";
    await finish({ status: "failed", error: reason });
    return { status: "failed", suggestionId: booked.id };
  }
}

/** Records what a person did with a suggestion. */
export async function decideSuggestion(db: Db, studioId: string, suggestionId: string, decision: "accepted" | "rejected", userId: string) {
  await db
    .update(aiSuggestion)
    .set({ decision, decidedById: userId, decidedAt: new Date() })
    .where(and(eq(aiSuggestion.studioId, studioId), eq(aiSuggestion.id, suggestionId)));
}
