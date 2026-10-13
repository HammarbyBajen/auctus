"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lead as leadTable } from "@/db/schema";
import { listLeadFields, PipelineError, readFieldValues, saveLeadFieldValues } from "@/lib/pipeline/service";
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
  values?: { name: string; email: string; phone: string; source: string; fields?: Record<string, string> };
};

const emailSchema = z.email();

export async function createLead(_: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const user = await requirePermission("leads", "write");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    source: String(formData.get("source") ?? "manual"),
    // What was typed in the studio's own fields, so it is not lost if the form comes back with an error.
    fields: Object.fromEntries([...formData.entries()].filter(([k]) => k.startsWith("field_")).map(([k, v]) => [k.slice(6), String(v)])),
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
  // The studio's own fields from the form (ticket 07), added to what the lead already has.
  const fieldValues = readFieldValues(await listLeadFields(db, user.studioId), formData);
  if (Object.keys(fieldValues).length > 0) {
    await db
      .update(leadTable)
      .set({ customFields: { ...lead.customFields, ...fieldValues } })
      .where(eq(leadTable.id, lead.id));
  }
  revalidatePath("/leads");
  redirect(`/leads/${lead.id}${duplicate ? "?dubblett=1" : ""}`);
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

export type ActivityFormState = { error?: MessageKey; saved?: number };

/**
 * One form for what happened: a contact button (Ringde, Inget svar, ...) logs
 * that and saves the note with it when one is written; "Spara anteckning"
 * saves the note alone, which then cannot be empty.
 */
export async function recordActivity(leadId: string, _: ActivityFormState, formData: FormData): Promise<ActivityFormState> {
  const user = await requirePermission("leads", "write");
  const intent = String(formData.get("intent") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (intent === "note") {
    if (body === "") return { error: "lead.noteError" };
  } else {
    try {
      await logContact(db, user.studioId, leadId, intent, user.id);
    } catch (error) {
      if (error instanceof LeadError) return { error: "lead.activityError" };
      throw error;
    }
  }
  if (body !== "") await addNote(db, user.studioId, leadId, body, user.id);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { saved: Date.now() };
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

/** Saves the studio's own fields on a lead (ticket 07). */
export async function saveLeadFieldsAction(leadId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  try {
    await saveLeadFieldValues(db, user.studioId, leadId, formData);
  } catch (error) {
    if (error instanceof PipelineError) notFound();
    throw error;
  }
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}?falt=1`);
}
