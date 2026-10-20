"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { aiSuggestion } from "@/db/schema";
import { callBrief, stepsFromNote, usableSteps, type Brief } from "@/lib/ai/assist";
import { decideSuggestion } from "@/lib/ai/client";
import { applySteps, type Step } from "@/lib/ai/tools";
import { requirePermission } from "@/lib/session";

/** The assistant on the lead page (ticket 30, phase B). Every call starts from a person pressing a button. */

const actorOf = (user: { id: string; studioId: string; role?: string | null }) => ({ id: user.id, studioId: user.studioId, role: user.role ?? null });

type Outcome = "not_configured" | "over_budget" | "failed";

export type BriefState = { brief?: Brief; error?: Outcome } | null;

/** A brief before a call. */
export async function prepareCall(leadId: string): Promise<BriefState> {
  const user = await requirePermission("leads", "read");
  const result = await callBrief(db, actorOf(user), leadId);
  return result.status === "ok" ? { brief: result.output } : { error: result.status };
}

export type StepsState = {
  error?: Outcome | "held_back" | "empty" | "none";
  suggestionId?: string;
  steps?: Step[];
  explanation?: string;
  saved?: number;
} | null;

/** The steps that follow from the note being written. */
export async function suggestSteps(leadId: string, _: StepsState, formData: FormData): Promise<StepsState> {
  const user = await requirePermission("leads", "write");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return { error: "empty" };
  const result = await stepsFromNote(db, actorOf(user), leadId, { body, private: formData.get("private") === "on" });
  if (result.status !== "ok") return { error: result.status };
  if (result.output.steps.length === 0) return { error: "none", explanation: result.output.explanation };
  return { suggestionId: result.suggestionId, steps: result.output.steps, explanation: result.output.explanation };
}

/**
 * Carries out the steps the person ticked, as them, all or nothing. The steps
 * come from the stored suggestion, never from the browser.
 */
export async function saveSteps(leadId: string, suggestionId: string, _: StepsState, formData: FormData): Promise<StepsState> {
  const user = await requirePermission("leads", "write");
  const [row] = await db
    .select({ suggestion: aiSuggestion.suggestion })
    .from(aiSuggestion)
    .where(and(eq(aiSuggestion.studioId, user.studioId), eq(aiSuggestion.id, suggestionId), eq(aiSuggestion.leadId, leadId), eq(aiSuggestion.kind, "after_call"), eq(aiSuggestion.status, "ok")))
    .limit(1);
  if (!row) return { error: "failed" };
  const steps = await usableSteps(db, user.studioId, (row.suggestion as { steps?: unknown } | null)?.steps);
  const chosen = new Set(formData.getAll("step").map(Number));
  const picked = steps.filter((_, i) => chosen.has(i));
  try {
    if (picked.length > 0) await applySteps(db, actorOf(user), leadId, picked);
  } catch {
    return { error: "failed" };
  }
  await decideSuggestion(db, user.studioId, suggestionId, picked.length > 0 ? "accepted" : "rejected", user.id);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
  return { saved: picked.length };
}
