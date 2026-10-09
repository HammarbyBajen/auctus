"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { db } from "@/db";
import { listMembershipKinds, saveIgnoredMemberships } from "@/lib/mana/leads";
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
  await saveIgnoredMemberships(db, user.studioId, ignored);
  revalidatePath("/installningar/mana");
  revalidatePath("/leads");
  redirect("/installningar/mana?sparat=1");
}
