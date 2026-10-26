"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listUsers } from "@/lib/users/service";
import {
  assignAlert,
  contactOutcomes,
  dismissAlert,
  dismissReasons,
  distributeAlerts,
  logContact,
  type ContactOutcome,
} from "@/lib/mana/at-risk-service";
import { listWinBackReasons } from "@/lib/pipeline/service";
import { requirePermission } from "@/lib/session";

const note = (formData: FormData) => String(formData.get("note") ?? "").slice(0, 2000);

/** A call, an email or a text: answered takes them off the list, the rest stay with the try noted. */
export async function logAtRiskContact(alertId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  const outcome = String(formData.get("outcome") ?? "");
  if (!(contactOutcomes as readonly string[]).includes(outcome)) return;
  await logContact(db, user.studioId, alertId, user.id, outcome as ContactOutcome, note(formData));
  revalidatePath("/");
  revalidatePath("/medlemmar");
}

/** The absence is explained (holiday, injury, other), maybe with a day they will be back. */
export async function dismissAtRisk(alertId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  const reason = String(formData.get("reason") ?? "");
  // Those away: holiday, injury or other; those leaving: the studio's own win-back reasons.
  const leavingReasons = (await listWinBackReasons(db, user.studioId)).map((r) => r.key);
  if (!(dismissReasons as readonly string[]).includes(reason) && !leavingReasons.includes(reason)) return;
  const returnBy = String(formData.get("returnBy") ?? "").trim();
  await dismissAlert(db, user.studioId, alertId, user.id, {
    reason,
    returnBy: /^\d{4}-\d{2}-\d{2}$/.test(returnBy) ? returnBy : null,
    body: note(formData),
  });
  revalidatePath("/");
  revalidatePath("/medlemmar");
}

/** Who gets in touch with this member. Only someone in the studio can be picked. */
export async function assignAtRisk(alertId: string, formData: FormData) {
  const user = await requirePermission("leads", "write");
  const assignee = String(formData.get("assignee") ?? "");
  const people = await listUsers(db, user.studioId);
  await assignAlert(db, user.studioId, alertId, people.some((p) => p.id === assignee && p.active) ? assignee : null);
  revalidatePath("/");
  revalidatePath("/medlemmar");
}

/** Shares the unassigned members among the staff ticked in the form. */
export async function distributeAtRisk(formData: FormData) {
  const user = await requirePermission("leads", "write");
  const people = await listUsers(db, user.studioId);
  const chosen = formData.getAll("staff").map(String).filter((id) => people.some((p) => p.id === id && p.active));
  await distributeAlerts(db, user.studioId, chosen);
  revalidatePath("/");
  revalidatePath("/medlemmar");
}
