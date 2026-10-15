"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { saveEmailSettings } from "@/lib/email/service";
import { saveAtRiskEmails } from "@/lib/mana/at-risk-service";
import { requirePermission } from "@/lib/session";

/** A sender as "Name <address>" or a bare address. */
const senderPattern = /^(?:[^<>@]+ <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

/** Saves the sender, the owner's switch and every template (M8). Owners only. */
export async function saveEmailSettingsAction(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  const text = (name: string, max: number) => String(formData.get(name) ?? "").slice(0, max);
  const from = text("from", 200).trim();
  if (from && !senderPattern.test(from)) redirect("/installningar/epost?fel=avsandare");
  await saveEmailSettings(db, user.studioId, {
    from: from || null,
    ownerLive: formData.get("live") === "on",
    leadEmail: { subject: text("leadSubject", 200), body: text("leadBody", 4000) },
  });
  await saveAtRiskEmails(db, user.studioId, {
    never: { subject: text("neverSubject", 200), body: text("neverBody", 4000) },
    away: { subject: text("awaySubject", 200), body: text("awayBody", 4000) },
  });
  revalidatePath("/", "layout");
  redirect("/installningar/epost?sparat=1");
}
