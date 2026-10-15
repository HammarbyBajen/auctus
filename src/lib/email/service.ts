import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { emailEvent, emailMessage, emailSuppression, studio, studioSettings, user, type AtRiskEmail } from "@/db/schema";
import { emailMode, fallbackFrom, normaliseAddress, recipientFor, type EmailMode } from "./mode";
import { hasResendKey, resendTransport, type EmailTransport, type WebhookEvent } from "./transport";

type Db = typeof defaultDb;

export type EmailSettings = { from: string; ownerLive: boolean; serverLive: boolean; hasKey: boolean; mode: EmailMode; leadEmail: AtRiskEmail };

const emptyTemplate: AtRiskEmail = { subject: "", body: "" };

/** How email is set up for a studio, and so which mode a send would use right now. */
export async function getEmailSettings(db: Db, studioId: string): Promise<EmailSettings> {
  const [row] = await db
    .select({ from: studioSettings.emailFrom, ownerLive: studioSettings.emailLive, leadEmail: studioSettings.leadEmail })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  const serverLive = process.env.EMAIL_LIVE === "true";
  const hasKey = hasResendKey();
  const ownerLive = row?.ownerLive ?? false;
  return {
    from: row?.from?.trim() || fallbackFrom,
    ownerLive,
    serverLive,
    hasKey,
    mode: emailMode({ hasKey, serverLive, ownerLive }),
    leadEmail: row?.leadEmail ?? emptyTemplate,
  };
}

export async function saveEmailSettings(db: Db, studioId: string, input: { from: string | null; ownerLive: boolean; leadEmail: AtRiskEmail }) {
  await db
    .update(studioSettings)
    .set({ emailFrom: input.from, emailLive: input.ownerLive, leadEmail: input.leadEmail, updatedAt: new Date() })
    .where(eq(studioSettings.studioId, studioId));
}

export type SendInput = {
  studioId: string;
  to: string;
  subject: string;
  body: string;
  /** Where replies go: the staff member's own address. */
  replyTo: string | null;
  leadId?: string;
  manaUserId?: string;
  sentById: string;
};

export type SendResult = { messageId: string; mode: EmailMode; status: "sent" | "not_sent" | "suppressed" | "failed" };

/**
 * Sends one email (M8 phase 1). The message is written first, so a retry is
 * the same email (its id is Resend's idempotency key) and every send is in
 * the history. A suppressed address (bounced, complained, unsubscribed) gets
 * nothing. In test mode the email goes to Resend's test address; without a
 * Resend key on the server nothing leaves at all.
 */
export async function sendEmail(db: Db, input: SendInput, transport: EmailTransport = resendTransport()): Promise<SendResult> {
  const settings = await getEmailSettings(db, input.studioId);
  const to = normaliseAddress(input.to);
  const [suppressed] = await db
    .select({ reason: emailSuppression.reason })
    .from(emailSuppression)
    .where(and(eq(emailSuppression.studioId, input.studioId), eq(emailSuppression.address, to)))
    .limit(1);
  const mode = settings.mode;
  const [message] = await db
    .insert(emailMessage)
    .values({
      studioId: input.studioId,
      leadId: input.leadId ?? null,
      manaUserId: input.manaUserId ?? null,
      to,
      sentTo: suppressed || mode === "dry_run" ? null : recipientFor(mode, to),
      subject: input.subject.trim(),
      body: input.body.trim(),
      mode,
      status: suppressed ? "suppressed" : "queued",
      sentById: input.sentById,
    })
    .returning({ id: emailMessage.id, sentTo: emailMessage.sentTo });

  if (suppressed) return { messageId: message.id, mode, status: "suppressed" };
  if (mode === "dry_run") {
    await db.update(emailMessage).set({ status: "not_sent", updatedAt: new Date() }).where(eq(emailMessage.id, message.id));
    return { messageId: message.id, mode, status: "not_sent" };
  }

  const [{ name: studioName }] = await db.select({ name: studio.name }).from(studio).where(eq(studio.id, input.studioId)).limit(1);
  let resendId: string;
  try {
    ({ id: resendId } = await transport.send({
      from: settings.from,
      to: message.sentTo!,
      replyTo: input.replyTo,
      subject: input.subject.trim(),
      body: input.body.trim(),
      studioName,
      messageId: message.id,
    }));
  } catch (error) {
    // Never the key or the address: only what went wrong.
    const reason = error instanceof Error ? error.message.slice(0, 300) : "okänt fel";
    await db.update(emailMessage).set({ status: "failed", error: reason, updatedAt: new Date() }).where(eq(emailMessage.id, message.id));
    return { messageId: message.id, mode, status: "failed" };
  }
  // Outside the try: once Resend has it, the email is sent, whatever happens to this update.
  await db.update(emailMessage).set({ status: "sent", resendId, updatedAt: new Date() }).where(eq(emailMessage.id, message.id));
  return { messageId: message.id, mode, status: "sent" };
}

const statusFor: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};
/** Later events win over earlier ones, but a delivery never undoes a bounce or a complaint. */
const rank: Record<string, number> = { queued: 0, sent: 1, delayed: 2, delivered: 3, failed: 4, bounced: 5, complained: 6 };

/**
 * Takes one event Resend reported (already verified). Each is handled once.
 * A hard bounce or a spam complaint puts the address on the suppression list,
 * but only for live emails: in test mode it was Resend's test address.
 */
export async function handleEmailEvent(db: Db, eventId: string, event: WebhookEvent) {
  const [message] = event.emailId ? await db.select().from(emailMessage).where(eq(emailMessage.resendId, event.emailId)).limit(1) : [];
  const [fresh] = await db
    .insert(emailEvent)
    .values({ id: eventId, messageId: message?.id ?? null, type: event.type })
    .onConflictDoNothing()
    .returning({ id: emailEvent.id });
  if (!fresh || !message) return { handled: Boolean(fresh), matched: Boolean(message) };

  const next = statusFor[event.type];
  if (next && (rank[next] ?? 0) >= (rank[message.status] ?? 0)) {
    await db.update(emailMessage).set({ status: next, updatedAt: new Date() }).where(eq(emailMessage.id, message.id));
  }
  const permanent = event.type === "email.bounced" && event.bounceType !== "Temporary";
  if (message.mode === "live" && (permanent || event.type === "email.complained")) {
    await db
      .insert(emailSuppression)
      .values({ studioId: message.studioId, address: message.to, reason: permanent ? "bounced" : "complained" })
      .onConflictDoNothing();
  }
  return { handled: true, matched: true };
}

/** The emails sent about a lead or a member, newest first, with who sent them. */
export async function listEmails(db: Db, studioId: string, about: { leadId: string } | { manaUserId: string }) {
  return db
    .select({
      id: emailMessage.id,
      to: emailMessage.to,
      subject: emailMessage.subject,
      body: emailMessage.body,
      mode: emailMessage.mode,
      status: emailMessage.status,
      createdAt: emailMessage.createdAt,
      sentBy: user.name,
    })
    .from(emailMessage)
    .leftJoin(user, eq(user.id, emailMessage.sentById))
    .where(
      and(
        eq(emailMessage.studioId, studioId),
        "leadId" in about ? eq(emailMessage.leadId, about.leadId) : eq(emailMessage.manaUserId, about.manaUserId),
      ),
    )
    .orderBy(desc(emailMessage.createdAt));
}

export async function listSuppressions(db: Db, studioId: string) {
  return db.select().from(emailSuppression).where(eq(emailSuppression.studioId, studioId)).orderBy(desc(emailSuppression.createdAt));
}
