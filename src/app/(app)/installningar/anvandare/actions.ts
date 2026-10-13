"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { isRole } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { addUser, createInvite, listUsers, setActive, setRole, UserError } from "@/lib/users/service";
import type { MessageKey } from "@/lib/i18n";

export type LinkState = { error?: MessageKey; link?: string; name?: string };

/** The address the link points at: this site, as the owner reached it. */
async function linkFor(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const base = host ? `${proto}://${host}` : (process.env.BETTER_AUTH_URL ?? "");
  return `${base}/valkommen/${token}`;
}

/** Adds a user and hands back their personal link, shown once on the page and nowhere else. */
export async function addUserAction(_: LinkState, formData: FormData): Promise<LinkState> {
  const owner = await requirePermission("users", "manage");
  const role = String(formData.get("role") ?? "");
  if (!isRole(role)) return { error: "users.error.invalid" };
  try {
    const name = String(formData.get("name") ?? "");
    const { token } = await addUser(db, owner.studioId, { name, email: String(formData.get("email") ?? ""), role }, owner.id);
    revalidatePath("/installningar/anvandare");
    return { link: await linkFor(token), name: name.trim() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.code === "email_taken" ? "users.error.taken" : "users.error.invalid" };
    throw error;
  }
}

/** A new personal link for someone (a forgotten password, or the first one ran out). */
export async function newLinkAction(userId: string, name: string): Promise<LinkState> {
  const owner = await requirePermission("users", "manage");
  const target = (await listUsers(db, owner.studioId)).find((u) => u.id === userId);
  if (!target || !target.active) return { error: "users.error.invalid" };
  const token = await createInvite(db, userId, owner.id);
  revalidatePath("/installningar/anvandare");
  return { link: await linkFor(token), name };
}

export async function setRoleAction(userId: string, formData: FormData) {
  const owner = await requirePermission("users", "manage");
  const role = String(formData.get("role") ?? "");
  if (isRole(role)) {
    try {
      await setRole(db, owner.studioId, userId, role, owner.id);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
    }
  }
  revalidatePath("/installningar/anvandare");
  redirect("/installningar/anvandare?sparat=1");
}

export async function setActiveAction(userId: string, active: boolean) {
  const owner = await requirePermission("users", "manage");
  try {
    await setActive(db, owner.studioId, userId, active, owner.id);
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
  }
  revalidatePath("/installningar/anvandare");
  redirect(`/installningar/anvandare?${active ? "aktiverad" : "avstangd"}=1`);
}
