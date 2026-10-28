import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { emailEvent, emailMessage, emailSuppression, studio, studioSettings, user, type AtRiskEmail } from "@/db/schema";
import { emailMode, fallbackFrom, normaliseAddress, recipientFor, validSender, type EmailMode } from "./mode";
import { hasResendKey, resendTransport, type EmailTransport, type WebhookEvent } from "./transport";

type Db = typeof defaultDb;

export type EmailSettings = { from: string; ownerLive: boolean; serverLive: boolean; hasKey: boolean; hasSender: boolean; mode: EmailMode; leadEmail: AtRiskEmail };

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
  const own = row?.from?.trim() ?? "";
  // Resend's test sender only reaches test addresses, so live needs Tegen's own.
  const hasSender = validSender(own) && !own.includes("@resend.dev");
  return {
    from: own || fallbackFrom,
    ownerLive,
    serverLive,
    hasKey,
    hasSender,
    mode: emailMode({ hasKey, serverLive, ownerLive, hasSender }),
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

/** Resend keeps an idempotency key for 24 hours; a retry within this reuses the failed email's key. */
const retryWindowMs = 23 * 60 * 60 * 1000;

/**
 * Sends one email (M8 phase 1). The message is written first, so every send
 * is in the history. Sending the same email again after it failed (same
 * person, text, sender and mode, within a day) reuses that message and so its
 * idempotency key: if Resend did take the first try after all, the person
 * still gets it once. A suppressed address (bounced, complained, unsubscribed)
 * gets nothing. In test mode the email goes to Resend's test address; without
 * a Resend key on the server nothing leaves at all.
 */
export async function sendEmail(db: Db, input: SendInput, transport: EmailTransport = resendTransport()): Promise<SendResult> {
  const to = normaliseAddress(input.to);
  const subject = input.subject.trim();
  const body = input.body.trim();
  const [settings, [suppressed], [{ name: studioName }]] = await Promise.all([
    getEmailSettings(db, input.studioId),
    db
      .select({ reason: emailSuppression.reason })
      .from(emailSuppression)
      .where(and(eq(emailSuppression.studioId, input.studioId), eq(emailSuppression.address, to)))
      .limit(1),
    db.select({ name: studio.name }).from(studio).where(eq(studio.id, input.studioId)).limit(1),
  ]);
  const mode = settings.mode;
  if (suppressed || mode === "dry_run") {
    const [message] = await db
      .insert(emailMessage)
      .values({ ...about(input), to, sentTo: null, subject, body, mode, status: suppressed ? "suppressed" : "not_sent" })
      .returning({ id: emailMessage.id });
    return { messageId: message.id, mode, status: suppressed ? "suppressed" : "not_sent" };
  }

  const sentTo = recipientFor(mode, to);
  const [failed] = await db
    .select({ id: emailMessage.id })
    .from(emailMessage)
    .where(
      and(
        eq(emailMessage.studioId, input.studioId),
        input.leadId ? eq(emailMessage.leadId, input.leadId) : isNull(emailMessage.leadId),
        input.manaUserId ? eq(emailMessage.manaUserId, input.manaUserId) : isNull(emailMessage.manaUserId),
        eq(emailMessage.to, to),
        eq(emailMessage.sentTo, sentTo),
        eq(emailMessage.subject, subject),
        eq(emailMessage.body, body),
        eq(emailMessage.mode, mode),
        eq(emailMessage.sentById, input.sentById),
        eq(emailMessage.status, "failed"),
        gte(emailMessage.createdAt, new Date(Date.now() - retryWindowMs)),
      ),
    )
    .orderBy(desc(emailMessage.createdAt))
    .limit(1);
  // Only one retry can take the failed message back; any other becomes an email of its own.
  const [retried] = failed
    ? await db
        .update(emailMessage)
        .set({ status: "queued", error: null, updatedAt: new Date() })
        .where(and(eq(emailMessage.id, failed.id), eq(emailMessage.status, "failed")))
        .returning({ id: emailMessage.id })
    : [];
  const message =
    retried ??
    (await db.insert(emailMessage).values({ ...about(input), to, sentTo, subject, body, mode, status: "queued" }).returning({ id: emailMessage.id }))[0];

  let resendId: string;
  try {
    ({ id: resendId } = await transport.send({ from: settings.from, to: sentTo, replyTo: input.replyTo, subject, body, studioName, messageId: message.id }));
  } catch (error) {
    // Never the key or the address: only what went wrong.
    const reason = error instanceof Error ? error.message.slice(0, 300) : "okänt fel";
    await db.update(emailMessage).set({ status: "failed", error: reason, updatedAt: new Date() }).where(eq(emailMessage.id, message.id));
    return { messageId: message.id, mode, status: "failed" };
  }
  // Outside the try: once Resend has it, the email is sent, whatever happens to this update.
  // An event may already have moved it further (it is found by our tag); that status stays.
  await db
    .update(emailMessage)
    .set({ resendId, status: sql`case when ${emailMessage.status} = 'queued' then 'sent' else ${emailMessage.status} end`, updatedAt: new Date() })
    .where(eq(emailMessage.id, message.id));
  return { messageId: message.id, mode, status: "sent" };
}

/** Who and what an email is about, and who sent it. */
const about = (input: SendInput) => ({
  studioId: input.studioId,
  leadId: input.leadId ?? null,
  manaUserId: input.manaUserId ?? null,
  sentById: input.sentById,
});

const statusFor: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};
/** Later events win over earlier ones, but a delivery never undoes a bounce or a complaint. */
const rank: Record<string, number> = { queued: 0, sent: 1, delayed: 2, delivered: 3, failed: 4, suppressed: 5, bounced: 5, complained: 6 };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Takes one event Resend reported (already verified). Each is handled once:
 * the event is noted and its effects written together, so a retry after a
 * failure does it all again rather than nothing. The email is found by the
 * tag Tegen HQ puts on every email (our message id), so an event that comes
 * before Resend's id is saved still lands; Resend's id is the fallback. The
 * Resend account is shared with tegen-web's lead emails, so events for emails
 * Tegen HQ did not send are ignored and not stored. A temporary bounce means
 * Resend is still trying, so it reads as delayed. A hard bounce or a spam
 * complaint puts the address on the suppression list, but only for live
 * emails: in test mode it was Resend's test address.
 */
export async function handleEmailEvent(db: Db, eventId: string, event: WebhookEvent) {
  const byTag = event.messageId && uuidPattern.test(event.messageId) ? eq(emailMessage.id, event.messageId) : undefined;
  const byResendId = event.emailId ? eq(emailMessage.resendId, event.emailId) : undefined;
  const [message] = byTag || byResendId ? await db.select().from(emailMessage).where(byTag ?? byResendId).limit(1) : [];
  if (!message || (byTag && event.emailId && message.resendId && message.resendId !== event.emailId)) return { handled: false, matched: false };

  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .insert(emailEvent)
      .values({ id: eventId, messageId: message.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: emailEvent.id });
    if (!fresh) return { handled: false, matched: true };

    const soft = event.type === "email.bounced" && event.bounceType === "Temporary";
    const next = soft ? "delayed" : statusFor[event.type];
    // Read again inside the transaction: the sender may have moved it since.
    const [current] = await tx.select({ status: emailMessage.status }).from(emailMessage).where(eq(emailMessage.id, message.id));
    // "failed" without a Resend id was set here after Resend had taken the email (a timeout): Resend's own report wins.
    const lostAnswer = current?.status === "failed" && !message.resendId;
    if (next && (lostAnswer || (rank[next] ?? 0) >= (rank[current?.status ?? "queued"] ?? 0))) {
      await tx
        .update(emailMessage)
        .set({ status: next, resendId: message.resendId ?? event.emailId, updatedAt: new Date() })
        .where(eq(emailMessage.id, message.id));
    }
    const permanent = event.type === "email.bounced" && !soft;
    if (message.mode === "live" && (permanent || event.type === "email.complained")) {
      await tx
        .insert(emailSuppression)
        .values({ studioId: message.studioId, address: message.to, reason: permanent ? "bounced" : "complained" })
        .onConflictDoNothing();
    }
    return { handled: true, matched: true };
  });
}

/** The emails sent about a lead or a member, newest first, with who sent them. */
export async function listEmails(db: Db, studioId: string, about: { leadId: string } | { manaUserId: string }) {
  return db
    .select({
      id: emailMessage.id,
      to: emailMessage.to,
      subject: emailMessage.subject,
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
