"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { addMilestoneRule, deleteMilestoneRule, MilestoneError, updateMilestoneRule } from "@/lib/mana/milestones-service";
import { requirePermission } from "@/lib/session";

const back = (query: string) => {
  revalidatePath("/installningar/milstolpar");
  redirect(`/installningar/milstolpar${query}`);
};

/** A new milestone (ticket 35), with the default message for its kind. Owners only. */
export async function addRule(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  try {
    await addMilestoneRule(db, user.studioId, String(formData.get("kind") ?? ""), Number(String(formData.get("threshold") ?? "").replace(/\s/g, "")));
  } catch (error) {
    if (error instanceof MilestoneError) back(`?fel=${error.code}#ny`);
    throw error;
  }
  back("?sparat=1");
}

/** A milestone's message, and whether it is on. */
export async function saveRule(id: string, formData: FormData) {
  const user = await requirePermission("settings", "manage");
  await updateMilestoneRule(db, user.studioId, id, {
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    active: formData.get("active") === "on",
  });
  back(`?sparat=1#regel-${id}`);
}

export async function removeRule(id: string) {
  const user = await requirePermission("settings", "manage");
  await deleteMilestoneRule(db, user.studioId, id);
  back("?sparat=1");
}
