"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sendEmail, type SendResult } from "@/lib/email/service";
import { addNote, getLead, logContact as logLeadContact } from "@/lib/leads/service";
import { alertMember, logContact as logMemberContact } from "@/lib/mana/at-risk-service";
import { handleMilestone, milestoneMember } from "@/lib/mana/milestones-service";
import { decideSuggestion } from "@/lib/ai/client";
import { requirePermission } from "@/lib/session";

export type ComposeState = { result?: SendResult["status"]; mode?: SendResult["mode"]; error?: "empty" | "no_address" | "gone" } | null;

/** A draft from the assistant that was sent (ticket 30, phase D): noted as accepted, by whom. */
async function acceptDraft(studioId: string, userId: string, formData: FormData, sent: boolean) {
  const suggestionId = String(formData.get("suggestion") ?? "");
  if (sent && /^[0-9a-f-]{36}$/i.test(suggestionId)) await decideSuggestion(db, studioId, suggestionId, "accepted", userId);
}

function draft(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 10_000);
  return subject && body ? { subject, body } : null;
}

/**
 * Emails a lead from Tegen HQ (M8 phase 1). When it really went to them, it
 * counts as a contact (Mejlade) with the subject in the history; in test mode
 * nothing is logged on the lead, since nobody was reached.
 */
export async function sendLeadEmail(leadId: string, _: ComposeState, formData: FormData): Promise<ComposeState> {
  const user = await requirePermission("leads", "write");
  const email = draft(formData);
  if (!email) return { error: "empty" };
  const found = await getLead(db, user.studioId, leadId);
  if (!found) return { error: "gone" };
  if (!found.person.email) return { error: "no_address" };
  const result = await sendEmail(db, { studioId: user.studioId, to: found.person.email, ...email, replyTo: user.email, leadId, sentById: user.id });
  if (result.status === "sent" && result.mode === "live") {
    await logLeadContact(db, user.studioId, leadId, "emailed", user.id);
    await addNote(db, user.studioId, leadId, `E-post: ${email.subject}`, user.id);
  }
  await acceptDraft(user.studioId, user.id, formData, result.status === "sent");
  revalidatePath(`/leads/${leadId}`);
  return { result: result.status, mode: result.mode };
}

/** Emails a member on the Hör av dig till list. When it really went to them, it is a try (Mejlat) in their notes. */
export async function sendMemberEmail(alertId: string, _: ComposeState, formData: FormData): Promise<ComposeState> {
  const user = await requirePermission("leads", "write");
  const email = draft(formData);
  if (!email) return { error: "empty" };
  const member = await alertMember(db, user.studioId, alertId);
  if (!member) return { error: "gone" };
  if (!member.email) return { error: "no_address" };
  const result = await sendEmail(db, { studioId: user.studioId, to: member.email, ...email, replyTo: user.email, manaUserId: member.manaUserId, sentById: user.id });
  if (result.status === "sent" && result.mode === "live") {
    await logMemberContact(db, user.studioId, alertId, user.id, "messaged", `E-post: ${email.subject}`);
  }
  await acceptDraft(user.studioId, user.id, formData, result.status === "sent");
  revalidatePath("/");
  revalidatePath("/medlemmar");
  return { result: result.status, mode: result.mode };
}

/** Congratulates a member on a milestone (ticket 35). When it really went to them, the milestone is done. */
export async function sendMilestoneEmail(hitId: string, _: ComposeState, formData: FormData): Promise<ComposeState> {
  const user = await requirePermission("leads", "write");
  const email = draft(formData);
  if (!email) return { error: "empty" };
  const member = await milestoneMember(db, user.studioId, hitId);
  if (!member) return { error: "gone" };
  if (!member.email) return { error: "no_address" };
  const result = await sendEmail(db, { studioId: user.studioId, to: member.email, ...email, replyTo: user.email, manaUserId: member.manaUserId, sentById: user.id });
  if (result.status === "sent" && result.mode === "live") await handleMilestone(db, user.studioId, hitId, "done", user.id);
  await acceptDraft(user.studioId, user.id, formData, result.status === "sent");
  revalidatePath("/");
  revalidatePath("/medlemmar");
  return { result: result.status, mode: result.mode };
}

