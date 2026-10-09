"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { requirePermission } from "@/lib/session";
import { manaSyncWorkflow } from "@/workflows/mana-sync";

/** Starts a Mana sync now. If one is already going, the workflow notices and does nothing. */
export async function syncNow() {
  const user = await requirePermission("settings", "manage");
  await start(manaSyncWorkflow, [user.studioId]);
  revalidatePath("/installningar/mana");
  redirect("/installningar/mana?startad=1");
}
