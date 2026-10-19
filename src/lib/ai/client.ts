import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, eq, gte, sum } from "drizzle-orm";
import type { z } from "zod";
import { db as defaultDb } from "@/db";
import { aiSuggestion, studioSettings } from "@/db/schema";
import { startOfMonthInStockholm } from "@/lib/home/time";

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

export const hasAiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
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

export type AiTransport = {
  complete<T>(model: string, request: AiRequest<T>): Promise<{ output: T | null; model: string; usage: AiUsage; refused: boolean }>;
};

/** Anthropic's API through the official SDK. A declined request is retried on Anthropic's own fallback model. */
export function anthropicTransport(): AiTransport {
  return {
    async complete(model, request) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.prompt }],
        output_config: { format: betaZodOutputFormat(request.schema), effort: request.effort ?? "medium" },
      });
      return {
        output: (response.parsed_output ?? null) as never,
        model: response.model,
        refused: response.stop_reason === "refusal",
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      };
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
  const [[spent], [settings]] = await Promise.all([
    db
      .select({ micro: sum(aiSuggestion.costMicroUsd) })
      .from(aiSuggestion)
      .where(and(eq(aiSuggestion.studioId, studioId), gte(aiSuggestion.createdAt, startOfMonthInStockholm(now)))),
    db.select({ ai: studioSettings.aiSettings }).from(studioSettings).where(eq(studioSettings.studioId, studioId)).limit(1),
  ]);
  return { spentUsd: Number(spent?.micro ?? 0) / 1_000_000, budgetUsd: settings?.ai?.monthlyBudgetUsd ?? defaultMonthlyBudgetUsd };
}

/**
 * Asks the AI for one suggestion. Not sent without a key, or once the month's
 * cap is reached. Every call that is sent, or stopped by the cap, is logged.
 */
export async function askAi<T>(db: Db, about: AiAbout, request: AiRequest<T>, transport: AiTransport = anthropicTransport(), now: Date = new Date()): Promise<AiResult<T>> {
  if (!hasAiKey()) return { status: "not_configured" };
  const model = aiModel();
  const row = { studioId: about.studioId, userId: about.userId, kind: about.kind, leadId: about.leadId ?? null, manaUserId: about.manaUserId ?? null, model };

  const { spentUsd, budgetUsd } = await aiBudget(db, about.studioId, now);
  if (spentUsd >= budgetUsd) {
    await db.insert(aiSuggestion).values({ ...row, status: "over_budget" });
    return { status: "over_budget", spentUsd, budgetUsd };
  }

  try {
    const result = await transport.complete(model, request);
    const cost = costMicroUsd(result.model, result.usage);
    const usage = { inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens, outputTokens: result.usage.outputTokens, costMicroUsd: cost };
    if (result.refused || result.output === null) {
      const [failed] = await db
        .insert(aiSuggestion)
        .values({ ...row, model: result.model, status: "failed", ...usage, error: result.refused ? "Modellen avböjde." : "Svaret gick inte att läsa." })
        .returning({ id: aiSuggestion.id });
      return { status: "failed", suggestionId: failed.id };
    }
    const [saved] = await db
      .insert(aiSuggestion)
      .values({ ...row, model: result.model, status: "ok", ...usage, suggestion: result.output as object })
      .returning({ id: aiSuggestion.id });
    return { status: "ok", suggestionId: saved.id, output: result.output };
  } catch (error) {
    // Only what went wrong: never the key, the prompt or the person.
    const reason = error instanceof Error ? error.message.slice(0, 300) : "okänt fel";
    const [failed] = await db.insert(aiSuggestion).values({ ...row, status: "failed", error: reason }).returning({ id: aiSuggestion.id });
    return { status: "failed", suggestionId: failed.id };
  }
}

/** Records what a person did with a suggestion. */
export async function decideSuggestion(db: Db, studioId: string, suggestionId: string, decision: "accepted" | "rejected", userId: string) {
  await db
    .update(aiSuggestion)
    .set({ decision, decidedById: userId, decidedAt: new Date() })
    .where(and(eq(aiSuggestion.studioId, studioId), eq(aiSuggestion.id, suggestionId)));
}
