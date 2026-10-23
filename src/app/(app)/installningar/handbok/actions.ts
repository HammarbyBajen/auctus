"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { createCategory, deleteCategory, HandbookError, moveCategory, renameCategory, setHandbookEditors } from "@/lib/handbook/service";
import { listUsers } from "@/lib/users/service";
import { requirePermission } from "@/lib/session";

const back = (query = "") => {
  revalidatePath("/installningar/handbok");
  revalidatePath("/handbok");
  redirect(`/installningar/handbok${query}`);
};

/** Adds a category to Handbok (ticket 37). Owners only. */
export async function addCategory(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  try {
    await createCategory(db, user.studioId, String(formData.get("name") ?? ""));
  } catch (error) {
    if (error instanceof HandbookError) back("?fel=namn#kategorier");
    throw error;
  }
  back("?sparat=1#kategorier");
}

export async function renameCategoryAction(id: string, formData: FormData) {
  const user = await requirePermission("settings", "manage");
  try {
    await renameCategory(db, user.studioId, id, String(formData.get("name") ?? ""));
  } catch (error) {
    if (error instanceof HandbookError) back("?fel=namn#kategorier");
    throw error;
  }
  back("?sparat=1#kategorier");
}

export async function moveCategoryAction(id: string, direction: "up" | "down") {
  const user = await requirePermission("settings", "manage");
  await moveCategory(db, user.studioId, id, direction);
  back("#kategorier");
}

/** Removes an empty category; one with routines in it is refused. */
export async function deleteCategoryAction(id: string) {
  const user = await requirePermission("settings", "manage");
  try {
    await deleteCategory(db, user.studioId, id);
  } catch (error) {
    if (error instanceof HandbookError) back("?fel=anvands#kategorier");
    throw error;
  }
  back("?sparat=1#kategorier");
}

/** Who besides the owners may write in Handbok. Only active staff of the studio can be picked. */
export async function saveEditors(formData: FormData) {
  const user = await requirePermission("settings", "manage");
  const people = await listUsers(db, user.studioId);
  const chosen = formData.getAll("editor").map(String).filter((id) => people.some((p) => p.id === id && p.active && p.role !== "owner"));
  await setHandbookEditors(db, user.studioId, chosen);
  back("?redaktorer=1#redaktorer");
}
