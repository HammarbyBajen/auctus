"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { handleMilestone } from "@/lib/mana/milestones-service";
import { requirePermission } from "@/lib/session";

/** A milestone handled (ticket 35): congratulated some other way (Klar), or let go (Hoppa över). */
export async function markMilestone(hitId: string, status: "done" | "skipped") {
  const user = await requirePermission("leads", "write");
  await handleMilestone(db, user.studioId, hitId, status, user.id);
  revalidatePath("/");
  revalidatePath("/medlemmar");
}
