"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { leadSources } from "@/lib/leads/constants";
import { addNote, createOrMatchLead } from "@/lib/leads/service";
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
