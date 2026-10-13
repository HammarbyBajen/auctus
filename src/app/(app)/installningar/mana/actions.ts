"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { acknowledgeApiChanges } from "@/lib/mana/api-watch-service";
import { listMembershipKinds, saveIgnoredMemberships } from "@/lib/mana/leads";
import { setAddOnMemberships, setWinBackEnabled } from "@/lib/mana/winback-service";
import { requirePermission } from "@/lib/session";
import { manaSyncWorkflow } from "@/workflows/mana-sync";

/** Starts a Mana sync now. If one is already going, the workflow notices and does nothing. */
export async function syncNow() {
  const user = await requirePermission("settings", "manage");
  await start(manaSyncWorkflow, [user.studioId]);
  revalidatePath("/installningar/mana");
  redirect("/installningar/mana?startad=1");
}

/** Saves which memberships count. Unticked ones are ignored when deciding whether someone is a member. */
export async function saveMembershipRules(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  const counted = new Set(formData.getAll("counts").map(String));
  const kinds = await listMembershipKinds(db, user.studioId);
  const ignored = kinds.map((k) => k.membershipId).filter((id) => !counted.has(id));
  const addOns = new Set(formData.getAll("addOn").map(String));
  await setAddOnMemberships(db, user.studioId, kinds.map((k) => k.membershipId).filter((id) => addOns.has(id)));
  await saveIgnoredMemberships(db, user.studioId, ignored);
  revalidatePath("/installningar/mana");
  revalidatePath("/leads");
  redirect("/installningar/mana?sparat=1");
}

/** Switches automatic win-back leads on or off. New leads appear after the next sync. */
export async function saveWinBackSetting(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  await setWinBackEnabled(db, user.studioId, formData.get("enabled") === "on");
  revalidatePath("/installningar/mana");
  redirect("/installningar/mana?vinnsparat=1");
}

/** Marks Mana's API changes as checked, which clears the notice. */
export async function acknowledgeApi() {
  const user = await requirePermission("settings", "manage");
  await acknowledgeApiChanges(db, user.id);
  revalidatePath("/", "layout");
  redirect("/installningar/mana#api");
}

/** Sets how many days without a visit put a paying member on the "Hör av dig till" list (ticket 13). */
export async function saveAtRiskDays(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  const days = Number(formData.get("days"));
  if (!Number.isInteger(days) || days < 7 || days > 180) redirect("/installningar/mana?riskfel=1#at-risk");
  await db.update(studioSettings).set({ atRiskDays: days, updatedAt: new Date() }).where(eq(studioSettings.studioId, user.studioId));
  revalidatePath("/installningar/mana");
  redirect("/installningar/mana?risksparat=1#at-risk");
}
