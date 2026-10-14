"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { ManaError } from "@/lib/mana/errors";
import { isMonth, lockMonth, pullMonth, setCounted, unlockMonth } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";

/** The Timmar pages (tickets 20-23) are for owners: `salary: read` is theirs only. */
const requireSalary = () => requirePermission("salary", "read");

const monthUrl = (month: string, extra = "") => `/timmar?manad=${month}${extra}`;

async function pull(studioId: string, month: string, userId: string) {
  try {
    return await pullMonth(db, await createManaClient(db, studioId), studioId, month, userId);
  } catch (error) {
    if (error instanceof ManaError) redirect(monthUrl(month, `&fel=mana-${error.code}`));
    throw error;
  }
}

/** Pulls (or pulls again) a month's work from Mana. */
export async function pullMonthAction(month: string) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  const result = await pull(user.studioId, month, user.id);
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, result.status === "locked" ? "&fel=locked" : "&hamtat=1"));
}

/** Locks a month. An old pull is refreshed from Mana first, so the frozen figures are current. */
export async function lockMonthAction(month: string) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  let result = await lockMonth(db, user.studioId, month, user.id);
  if (result.status === "stale") {
    await pull(user.studioId, month, user.id);
    result = await lockMonth(db, user.studioId, month, user.id);
  }
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, result.status === "locked_now" ? "&last=1" : `&fel=${result.status}`));
}

export async function unlockMonthAction(month: string) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  await unlockMonth(db, user.studioId, month, user.id);
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, "&upplast=1"));
}

/** Saves which of the month's categories count: the ticked ones do, the rest are left out. */
export async function setCountedAction(month: string, formData: FormData) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  const shown = formData.getAll("shown").map(String);
  const counted = formData.getAll("counted").map(String);
  await setCounted(db, user.studioId, shown, counted);
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, "&urval=1"));
}
