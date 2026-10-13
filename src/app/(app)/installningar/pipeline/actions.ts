"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  addColdReason,
  addLeadField,
  addStage,
  moveColdReasonOrder,
  moveStageOrder,
  parseOptions,
  PipelineError,
  removeColdReason,
  removeLeadField,
  removeStage,
  renameColdReason,
  renameStage,
  updateLeadField,
} from "@/lib/pipeline/service";
import { requirePermission } from "@/lib/session";

/** Runs an edit as an owner, then back to the right part of the page with how it went. */
async function edit(section: string, run: (studioId: string, userId: string) => Promise<unknown>): Promise<never> {
  const owner = await requirePermission("settings", "manage");
  let error: string | null = null;
  try {
    await run(owner.studioId, owner.id);
  } catch (e) {
    if (!(e instanceof PipelineError)) throw e;
    error = e.code;
  }
  revalidatePath("/", "layout");
  redirect(`/installningar/pipeline?${error ? `fel=${error}` : "sparat=1"}#${section}`);
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const direction = (form: FormData) => (form.get("direction") === "up" ? "up" : "down");

export async function renameStageAction(key: string, form: FormData) {
  return edit("stages", (studio) => renameStage(db, studio, key, text(form, "name")));
}
export async function addStageAction(form: FormData) {
  return edit("stages", (studio) => addStage(db, studio, text(form, "name")));
}
export async function moveStageAction(key: string, form: FormData) {
  return edit("stages", (studio) => moveStageOrder(db, studio, key, direction(form)));
}
export async function removeStageAction(key: string, form: FormData) {
  return edit("stages", (studio, user) => removeStage(db, studio, key, { moveTo: text(form, "moveTo") || null, authorId: user }));
}

export async function renameReasonAction(key: string, form: FormData) {
  return edit("reasons", (studio) => renameColdReason(db, studio, key, text(form, "name")));
}
export async function addReasonAction(form: FormData) {
  return edit("reasons", (studio) => addColdReason(db, studio, text(form, "name")));
}
export async function moveReasonAction(key: string, form: FormData) {
  return edit("reasons", (studio) => moveColdReasonOrder(db, studio, key, direction(form)));
}
export async function removeReasonAction(key: string) {
  return edit("reasons", (studio) => removeColdReason(db, studio, key));
}

export async function addFieldAction(form: FormData) {
  const type = form.get("type") === "choice" ? "choice" : "text";
  return edit("fields", (studio) => addLeadField(db, studio, { label: text(form, "label"), type, options: parseOptions(text(form, "options")) }));
}
export async function updateFieldAction(key: string, form: FormData) {
  return edit("fields", (studio) =>
    updateLeadField(db, studio, key, { label: text(form, "label"), options: form.has("options") ? parseOptions(text(form, "options")) : undefined }),
  );
}
export async function removeFieldAction(key: string) {
  return edit("fields", (studio) => removeLeadField(db, studio, key));
}
