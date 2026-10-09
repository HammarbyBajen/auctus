"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { leadSources } from "@/lib/leads/constants";
import { addNote, createOrMatchLead, getLead, LeadError, logContact, moveLeadStage } from "@/lib/leads/service";
import { createManaClient } from "@/lib/mana/config";
import { refreshPersonFromMana } from "@/lib/mana/leads";
import { setWinBackReason, WinBackError } from "@/lib/mana/winback-service";
import { assignLead, createTask, deleteTask, setTaskDone, TaskError } from "@/lib/tasks/service";
import { requirePermission } from "@/lib/session";
import type { MessageKey } from "@/lib/i18n";

export type LeadFormState = {
  error?: MessageKey;
  values?: { name: string; email: string; phone: string; source: string };
};

const emailSchema = z.email();

export async function createLead(_: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const user = await requirePermission("leads", "write");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    source: String(formData.get("source") ?? "manual"),
  };

  if (values.name === "") return { error: "leadForm.errorName", values };
  if (values.email === "" && values.phone === "") return { error: "leadForm.errorContact", values };
  if (values.email !== "" && !emailSchema.safeParse(values.email).success) {
    return { error: "leadForm.errorEmail", values };
  }
  const source = leadSources.find((s) => s === values.source) ?? "manual";

  const { lead, duplicate } = await createOrMatchLead(db, user.studioId, {
    name: values.name,
    email: values.email,
    phone: values.phone,
    source,
    createdById: user.id,
  });
  revalidatePath("/leads");
  redirect(`/leads/${lead.id}${duplicate ? "?dubblett=1" : ""}`);
}

export type NoteFormState = { error?: MessageKey };

export async function addLeadNote(
  leadId: string,
  _: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requirePermission("leads", "write");
  const body = String(formData.get("body") ?? "").trim();
  if (body === "") return { error: "lead.noteError" };
  await addNote(db, user.studioId, leadId, body, user.id);
  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function moveStage(leadId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  const toStage = String(formData.get("stage") ?? "");
  const reason = String(formData.get("coldReason") ?? "") || null;
  try {
    await moveLeadStage(db, user.studioId, leadId, toStage, { coldReason: reason, authorId: user.id });
  } catch (error) {
    if (error instanceof LeadError) {
      redirect(`/leads/${leadId}?fel=${error.code === "cold_reason_required" ? "anledning" : "steg"}`);
    }
    throw error;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}`);
}

export async function logContactAction(leadId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  try {
    await logContact(db, user.studioId, leadId, String(formData.get("outcome") ?? ""), user.id);
  } catch (error) {
    if (error instanceof LeadError) redirect(`/leads/${leadId}?fel=steg`);
    throw error;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}`);
}

export type TaskFormState = { error?: MessageKey };

export async function addTask(
  leadId: string,
  _: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requirePermission("leads", "write");
  const title = String(formData.get("title") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "");
  if (title === "") return { error: "task.errorTitle" };
  if (!z.iso.date().safeParse(dueDate).success) return { error: "task.errorDate" };
  try {
    await createTask(db, user.studioId, leadId, { title: title.slice(0, 200), dueDate }, user.id);
  } catch (error) {
    if (error instanceof TaskError) notFound();
    throw error;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return {};
}

export async function finishTask(leadId: string, taskId: string, done: boolean) {
  const user = await requirePermission("leads", "write");
  try {
    await setTaskDone(db, user.studioId, taskId, done, user.id);
  } catch (error) {
    if (error instanceof TaskError) notFound();
    throw error;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

export async function removeTask(leadId: string, taskId: string) {
  const user = await requirePermission("leads", "write");
  try {
    await deleteTask(db, user.studioId, taskId);
  } catch (error) {
    if (error instanceof TaskError) notFound();
    throw error;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

export async function assignAction(leadId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  const chosen = String(formData.get("assignee") ?? "") || null;
  try {
    await assignLead(db, user.studioId, leadId, chosen);
  } catch (error) {
    if (error instanceof TaskError) notFound();
    throw error;
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

/**
 * Looks the lead's person up in Mana right now. Called by the lead page after
 * it has shown, so the page never waits for Mana. Any problem with Mana is
 * ignored here: the page already shows what the last sync knew.
 */
export async function checkLeadInMana(leadId: string): Promise<{ changed: boolean }> {
  const user = await requirePermission("leads", "read");
  const found = await getLead(db, user.studioId, leadId);
  if (!found) return { changed: false };
  try {
    const client = await createManaClient(db, user.studioId, null, { maxRetries: 1 });
    const changed = await refreshPersonFromMana(db, client, user.studioId, found.person.id);
    if (changed) revalidatePath(`/leads/${leadId}`);
    return { changed };
  } catch {
    return { changed: false };
  }
}

export async function saveWinBackReason(leadId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  try {
    await setWinBackReason(db, user.studioId, leadId, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof WinBackError && error.code === "unknown_reason") redirect(`/leads/${leadId}?fel=vinnanledning`);
    if (error instanceof WinBackError) notFound();
    throw error;
  }
  revalidatePath("/");
  revalidatePath(`/leads/${leadId}`);
}
