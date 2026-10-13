"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { minPasswordLength, redeemInvite, UserError } from "@/lib/users/service";
import type { MessageKey } from "@/lib/i18n";

export type WelcomeState = { error?: MessageKey };

/** Sets the password from a personal link, then on to the login page. */
export async function choosePassword(token: string, _: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (password.length < minPasswordLength) return { error: "welcome.tooShort" };
  if (password !== repeat) return { error: "welcome.mismatch" };
  try {
    await redeemInvite(db, token, password);
  } catch (error) {
    if (error instanceof UserError) return { error: "welcome.expired" };
    throw error;
  }
  redirect("/login?valkommen=1");
}
