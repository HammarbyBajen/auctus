"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { requirePermission } from "@/lib/session";

/** Saves the assistant's monthly cost cap and the studio's own health words (ticket 30). Owners only. */
export async function saveAiSettings(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  const budget = Number(String(formData.get("budget") ?? "").replace(",", "."));
  if (!(Number.isFinite(budget) && budget >= 0 && budget <= 1000)) redirect("/installningar/assistent?fel=budget");
  const healthTerms = [
    ...new Set(
      String(formData.get("terms") ?? "")
        .split(/[\n,]+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 2 && w.length <= 40),
    ),
  ].slice(0, 200);
  await db
    .update(studioSettings)
    .set({ aiSettings: { monthlyBudgetUsd: Math.round(budget * 100) / 100, healthTerms }, updatedAt: new Date() })
    .where(eq(studioSettings.studioId, user.studioId));
  revalidatePath("/installningar/assistent");
  redirect("/installningar/assistent?sparat=1");
}
