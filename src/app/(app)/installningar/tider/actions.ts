"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { parseThresholdsForm } from "@/lib/home/thresholds-form";
import { requirePermission } from "@/lib/session";

/** Saves the deadline limits and the days the clock runs (ticket 06). Home uses them on its next load. */
export async function saveThresholds(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  const parsed = parseThresholdsForm(formData);
  if (!parsed.ok) redirect(`/installningar/tider?fel=${parsed.error}`);
  await db.update(studioSettings).set({ thresholds: parsed.value, updatedAt: new Date() }).where(eq(studioSettings.studioId, user.studioId));
  revalidatePath("/", "layout");
  redirect("/installningar/tider?sparat=1");
}
