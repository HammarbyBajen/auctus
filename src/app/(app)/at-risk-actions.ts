"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dismissReasons, handleAtRisk, type DismissReason } from "@/lib/mana/at-risk-service";
import { requirePermission } from "@/lib/session";

/** Someone got in touch with the member: the alert is done. */
export async function markAtRiskContacted(alertId: string) {
  const user = await requirePermission("leads", "write");
  await handleAtRisk(db, user.studioId, alertId, user.id, { kind: "contacted" });
  revalidatePath("/");
}

/** The absence is explained (holiday, injury, other): the alert goes, and comes back only after a new visit. */
export async function dismissAtRisk(alertId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  const reason = String(formData.get("reason") ?? "");
  if (!(dismissReasons as readonly string[]).includes(reason)) return;
  await handleAtRisk(db, user.studioId, alertId, user.id, { kind: "dismissed", reason: reason as DismissReason });
  revalidatePath("/");
}
