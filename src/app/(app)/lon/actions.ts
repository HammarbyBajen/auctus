"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { ManaError } from "@/lib/mana/errors";
import { isMonth, lockMonth, pullMonth, removePerson, savePerson, setRule, unlockMonth } from "@/lib/salary/service";
import { requirePermission } from "@/lib/session";

/** The Salary pages (tickets 20-23) are for owners: `salary: read` is theirs only. */
const requireSalary = () => requirePermission("salary", "read");

const monthUrl = (month: string, extra = "") => `/lon?manad=${month}${extra}`;

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
  if (!isMonth(month)) redirect("/lon");
  const result = await pull(user.studioId, month, user.id);
  revalidatePath("/lon", "layout");
  redirect(monthUrl(month, result.status === "locked" ? "&fel=locked" : "&hamtat=1"));
}

/** Locks a month. An old pull is refreshed from Mana first, so the frozen figures are current. */
export async function lockMonthAction(month: string) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/lon");
  let result = await lockMonth(db, user.studioId, month, user.id);
  if (result.status === "stale") {
    await pull(user.studioId, month, user.id);
    result = await lockMonth(db, user.studioId, month, user.id);
  }
  revalidatePath("/lon", "layout");
  redirect(monthUrl(month, result.status === "locked_now" ? "&last=1" : `&fel=${result.status}`));
}

export async function unlockMonthAction(month: string) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/lon");
  await unlockMonth(db, user.studioId, month, user.id);
  revalidatePath("/lon", "layout");
  redirect(monthUrl(month, "&upplast=1"));
}

/** Paid, not paid, or not decided, for one kind of work. */
export async function setRuleAction(typeKey: string, formData: FormData) {
  const user = await requireSalary();
  const value = formData.get("paid");
  await setRule(db, user.studioId, typeKey, value === "yes" ? true : value === "no" ? false : null);
  revalidatePath("/lon", "layout");
  redirect("/lon/regler?sparat=1");
}

function personFrom(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const instructor = String(formData.get("manaInstructorId") ?? "").trim();
  const free = Number(formData.get("freeClassesPerWeek") ?? 0);
  const activeFrom = String(formData.get("activeFrom") ?? "").trim();
  if (!name || !Number.isInteger(free) || free < 0 || free > 20 || (activeFrom && !/^\d{4}-\d{2}-\d{2}$/.test(activeFrom))) return null;
  return {
    name,
    manaInstructorId: instructor || null,
    freeClassesPerWeek: free,
    activeFrom: activeFrom || null,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000),
  };
}

/** Adds a coach, or saves one when an id is bound. */
export async function savePersonAction(id: string | null, formData: FormData) {
  const user = await requireSalary();
  const input = personFrom(formData);
  if (!input) redirect("/lon/personer?fel=invalid");
  const result = await savePerson(db, user.studioId, input, id ?? undefined);
  if (result.status !== "saved") redirect(`/lon/personer?fel=${result.status}`);
  revalidatePath("/lon", "layout");
  redirect("/lon/personer?sparat=1");
}

export async function removePersonAction(id: string) {
  const user = await requireSalary();
  await removePerson(db, user.studioId, id);
  revalidatePath("/lon", "layout");
  redirect("/lon/personer?borttagen=1");
}
