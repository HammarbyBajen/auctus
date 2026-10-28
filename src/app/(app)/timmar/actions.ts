"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { createManaClient } from "@/lib/mana/config";
import { ManaError } from "@/lib/mana/errors";
import { getAccountantEmail, getMonth, isMonth, listCoaches, lockMonth, noteSentToAccountant, pullMonth, setAccountantEmail, setCounted, setHourlyRate, unlockMonth } from "@/lib/salary/service";
import { exportSheet, toXlsx } from "@/lib/salary/export";
import { sendEmail } from "@/lib/email/service";
import { formatMonth } from "@/lib/format";
import { t } from "@/lib/i18n";
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

/** Saves every coach's gross pay per hour: kronor in the form, öre in the database; an empty field clears it. */
export async function setRatesAction(month: string, formData: FormData) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  for (const coach of await listCoaches(db, user.studioId)) {
    const raw = String(formData.get(`rate:${coach.id}`) ?? "").trim().replace(",", ".");
    if (raw === "") {
      await setHourlyRate(db, user.studioId, coach.id, null);
      continue;
    }
    const kr = Number(raw);
    if (!Number.isFinite(kr) || kr < 0 || kr > 10_000) redirect(monthUrl(month, "&fel=rate"));
    await setHourlyRate(db, user.studioId, coach.id, Math.round(kr * 100));
  }
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, "&timlon=1"));
}

/** Saves where a locked month's hours go. An empty field clears it. */
export async function setAccountantEmailAction(month: string, formData: FormData) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(monthUrl(month, "&fel=accountant"));
  await setAccountantEmail(db, user.studioId, email || null);
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, "&revisor=1"));
}

/**
 * Emails a locked month's hours to the accountant as the Excel file, the same
 * letter every month. Only a locked month: the accountant must get the frozen
 * figures. Logged on the month, so the page shows who sent it and when.
 */
export async function sendToAccountantAction(month: string) {
  const user = await requireSalary();
  if (!isMonth(month)) redirect("/timmar");
  const [to, state] = await Promise.all([getAccountantEmail(db, user.studioId), getMonth(db, user.studioId, month)]);
  if (!to) redirect(monthUrl(month, "&fel=no_accountant"));
  if (!state.lockedAt || !state.result) redirect(monthUrl(month, "&fel=not_locked"));
  const name = formatMonth(month);
  const result = await sendEmail(db, {
    studioId: user.studioId,
    to,
    subject: t("salary.accountantSubject", { month: name }),
    body: t("salary.accountantBody", { month: name, who: user.name }),
    replyTo: user.email,
    sentById: user.id,
    attachment: { filename: `timmar-${month}.xlsx`, content: Buffer.from(toXlsx(exportSheet(state.result), name)), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
  if (result.status === "sent") await noteSentToAccountant(db, user.studioId, month, user.id);
  revalidatePath("/timmar", "layout");
  redirect(monthUrl(month, result.status === "sent" ? "&skickat=1" : `&fel=send_${result.status}`));
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
