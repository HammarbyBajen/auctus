"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { ManaError } from "@/lib/mana/errors";
import { isMonth, lockMonth, pullMonth, saveDeal, setRule, unlockMonth } from "@/lib/salary/service";
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

/** Paid, not paid, or not decided, for one kind of work. */
export async function setRuleAction(typeKey: string, formData: FormData) {
  const user = await requireSalary();
  const value = formData.get("paid");
  await setRule(db, user.studioId, typeKey, value === "yes" ? true : value === "no" ? false : null);
  revalidatePath("/timmar", "layout");
  redirect("/timmar/regler?sparat=1");
}

function dealFrom(formData: FormData) {
  const free = Number(formData.get("freeClassesPerWeek") ?? 0);
  const activeFrom = String(formData.get("activeFrom") ?? "").trim();
  if (!Number.isInteger(free) || free < 0 || free > 20 || (activeFrom && !/^\d{4}-\d{2}-\d{2}$/.test(activeFrom))) return null;
  return { freeClassesPerWeek: free, activeFrom: activeFrom || null, notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) };
}

/** Saves a coach's free-class deal. */
export async function saveDealAction(instructorId: string, formData: FormData) {
  const user = await requireSalary();
  const input = dealFrom(formData);
  if (!input) redirect("/timmar/coacher?fel=invalid");
  const result = await saveDeal(db, user.studioId, instructorId, input);
  if (result !== "saved") redirect(`/timmar/coacher?fel=${result}`);
  revalidatePath("/timmar", "layout");
  redirect("/timmar/coacher?sparat=1");
}
