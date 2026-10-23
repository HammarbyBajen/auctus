"use server";

import { db } from "@/db";
import { askOwnerQuestion, type OwnerAnswer } from "@/lib/ai/owner";
import { requirePermission } from "@/lib/session";

export type QuestionState = { question?: string; answer?: OwnerAnswer; error?: "not_configured" | "over_budget" | "failed" | "empty" } | null;

/** An owner's question to the assistant (ticket 30, phase E), answered from Tegen HQ's own figures. */
export async function askQuestion(_: QuestionState, formData: FormData): Promise<QuestionState> {
  const user = await requirePermission("kpi", "read");
  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (!question) return { error: "empty" };
  const result = await askOwnerQuestion(db, { id: user.id, studioId: user.studioId, role: user.role ?? null }, question);
  return result.status === "ok" ? { question, answer: result.output } : { question, error: result.status };
}
