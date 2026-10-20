import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/db";
import { aiSuggestion } from "@/db/schema";

/**
 * The brief before a call (ticket 30, phase B): its shape, and the latest one
 * for a lead. Kept apart from the AI client, so the lead page can show a
 * stored brief without loading the client and its SDK.
 */

type Db = typeof defaultDb;

export const briefSchema = z.object({
  summary: z.string().describe("Two or three short sentences: who this is, what they want, where it stands."),
  facts: z.array(z.string()).describe("Up to five short facts worth having in mind on the call, newest first."),
  opening: z.string().describe("One natural opening line for the call, in Swedish, using the first name."),
  questions: z.array(z.string()).describe("Up to three questions to ask, in Swedish."),
  nextStep: z.string().describe("The one next step to aim for on this call."),
});
export type Brief = z.infer<typeof briefSchema>;

/** The latest brief for a lead, if nothing has happened on the lead since it was made. */
export async function latestBrief(db: Db, studioId: string, leadId: string, lastActivity: Date) {
  const [row] = await db
    .select({ id: aiSuggestion.id, suggestion: aiSuggestion.suggestion, createdAt: aiSuggestion.createdAt })
    .from(aiSuggestion)
    .where(and(eq(aiSuggestion.studioId, studioId), eq(aiSuggestion.leadId, leadId), eq(aiSuggestion.kind, "call_brief"), eq(aiSuggestion.status, "ok")))
    .orderBy(desc(aiSuggestion.createdAt))
    .limit(1);
  if (!row || row.createdAt < lastActivity) return null;
  const parsed = briefSchema.safeParse(row.suggestion);
  return parsed.success ? { id: row.id, brief: parsed.data, at: row.createdAt } : null;
}
