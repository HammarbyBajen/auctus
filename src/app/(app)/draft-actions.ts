"use server";

import { db } from "@/db";
import { draftLeadEmail, draftMemberEmail, draftMilestoneEmail } from "@/lib/ai/drafts";
import { requirePermission } from "@/lib/session";

/** Email drafts from the assistant (ticket 30, phase D). Every one starts from a person pressing a button. */

export type DraftState = { subject?: string; body?: string; suggestionId?: string; error?: "not_configured" | "over_budget" | "failed"; version: number };

const current = (formData: FormData) => ({
  subject: String(formData.get("subject") ?? "").slice(0, 200),
  body: String(formData.get("body") ?? "").slice(0, 4000),
});

const actorOf = (user: { id: string; studioId: string; role?: string | null }) => ({ id: user.id, studioId: user.studioId, role: user.role ?? null });

/** A draft to a lead, starting from what is already in the form. */
export async function draftForLead(leadId: string, state: DraftState, formData: FormData): Promise<DraftState> {
  const user = await requirePermission("leads", "write");
  const result = await draftLeadEmail(db, actorOf(user), leadId, current(formData), user.name);
  if (result.status !== "ok") return { error: result.status, version: state.version };
  return { ...result.output, suggestionId: result.suggestionId, version: state.version + 1 };
}

/** A draft to a member on the Medlemmar list. */
export async function draftForMember(alertId: string, state: DraftState, formData: FormData): Promise<DraftState> {
  const user = await requirePermission("leads", "write");
  const result = await draftMemberEmail(db, actorOf(user), alertId, current(formData), user.name);
  if (result.status === "not_found") return { error: "failed", version: state.version };
  if (result.status !== "ok") return { error: result.status, version: state.version };
  return { ...result.output, suggestionId: result.suggestionId, version: state.version + 1 };
}

/** A congratulation to a member who reached a milestone (ticket 35). */
export async function draftForMilestone(hitId: string, state: DraftState, formData: FormData): Promise<DraftState> {
  const user = await requirePermission("leads", "write");
  const result = await draftMilestoneEmail(db, actorOf(user), hitId, current(formData), user.name);
  if (result.status === "not_found") return { error: "failed", version: state.version };
  if (result.status !== "ok") return { error: result.status, version: state.version };
  return { ...result.output, suggestionId: result.suggestionId, version: state.version + 1 };
}

