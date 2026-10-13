"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { lead } from "@/db/schema";
import { deletePerson } from "@/lib/privacy/service";
import { requirePermission } from "@/lib/session";

/**
 * Permanently deletes the person behind a lead (ticket 17). Owners only, and
 * only with the confirmation box ticked: the server checks it too, so a form
 * sent without it deletes nothing.
 */
export async function deletePersonAction(leadId: string, formData: FormData) {
  const user = await requirePermission("settings", "manage");
  if (formData.get("confirm") !== "ja") redirect(`/leads/${leadId}/radera?fel=bekrafta`);
  const [found] = await db
    .select({ personId: lead.personId })
    .from(lead)
    .where(and(eq(lead.studioId, user.studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!found) notFound();
  await deletePerson(db, user.studioId, found.personId, user.id);
  revalidatePath("/", "layout");
  redirect(formData.get("from") === "integritet" ? "/installningar/integritet?raderad=1" : "/leads?raderad=1");
}
