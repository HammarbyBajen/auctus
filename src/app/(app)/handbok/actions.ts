"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { archivePage, canEditHandbook, createPage, deletePage, HandbookError, restoreVersion, unarchivePage, updatePage } from "@/lib/handbook/service";
import { requireUser } from "@/lib/session";
import type { MessageKey } from "@/lib/i18n";

/** Someone who may write in Handbok (an owner, or chosen by the owners), otherwise back to Handbok. */
async function requireEditor() {
  const user = await requireUser();
  if (!(await canEditHandbook(db, user))) redirect("/handbok?fel=behorighet");
  return user;
}

export type PageFormState = { error?: MessageKey };

/** Saves a new routine (no id) or a change to one, then shows it. */
export async function savePage(id: string | null, _: PageFormState, formData: FormData): Promise<PageFormState> {
  const user = await requireEditor();
  const input = {
    title: String(formData.get("title") ?? ""),
    categoryId: String(formData.get("category") ?? ""),
    content: String(formData.get("content") ?? ""),
  };
  if (!input.title.trim()) return { error: "handbook.errorTitle" };
  if (!input.categoryId) return { error: "handbook.errorCategory" };
  // When the routine had last been changed as the editor opened it, so nobody's save is overwritten unseen.
  const basedOn = new Date(String(formData.get("basedOn") ?? ""));
  let pageId = id;
  try {
    if (id) await updatePage(db, user.studioId, id, user.id, input, Number.isNaN(basedOn.getTime()) ? null : basedOn);
    else pageId = (await createPage(db, user.studioId, user.id, input)).id;
  } catch (error) {
    if (error instanceof HandbookError && error.code === "not_found") notFound();
    if (error instanceof HandbookError) return { error: error.code === "conflict" ? "handbook.errorConflict" : "handbook.errorSave" };
    throw error;
  }
  revalidatePath("/handbok");
  redirect(`/handbok/${pageId}`);
}

/** Takes a routine out of use: hidden from Handbok, kept with its history, back with one click. */
export async function archive(id: string) {
  const user = await requireEditor();
  try {
    await archivePage(db, user.studioId, id, user.id);
  } catch (error) {
    if (error instanceof HandbookError) notFound();
    throw error;
  }
  revalidatePath("/handbok");
  redirect(`/handbok/${id}?arkiverad=1`);
}

/** Brings an archived routine back into Handbok. */
export async function unarchive(id: string) {
  const user = await requireEditor();
  try {
    await unarchivePage(db, user.studioId, id);
  } catch (error) {
    if (error instanceof HandbookError) notFound();
    throw error;
  }
  revalidatePath("/handbok");
  redirect(`/handbok/${id}?tillbaka=1`);
}

/** Deletes a routine for good, with its history. */
export async function removePage(id: string) {
  const user = await requireEditor();
  try {
    await deletePage(db, user.studioId, id);
  } catch (error) {
    if (error instanceof HandbookError) notFound();
    throw error;
  }
  revalidatePath("/handbok");
  redirect("/handbok?borttagen=1");
}

/** Brings back an earlier version, as a new version. */
export async function restore(id: string, versionId: string) {
  const user = await requireEditor();
  try {
    await restoreVersion(db, user.studioId, id, versionId, user.id);
  } catch (error) {
    if (error instanceof HandbookError) notFound();
    throw error;
  }
  revalidatePath("/handbok");
  revalidatePath(`/handbok/${id}`);
  redirect(`/handbok/${id}?aterstalld=1`);
}
