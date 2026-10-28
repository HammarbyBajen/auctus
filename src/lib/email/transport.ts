import "server-only";
import { Resend } from "resend";
import { emailHtml, emailText } from "./layout";

/**
 * The only place in Tegen HQ that talks to Resend (a test keeps it that way).
 * The key is read here and nowhere else, and never logged.
 */

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  body: string;
  studioName: string;
  /** Our message id: tagged on the email, and the idempotency key, so a retry is the same email. */
  messageId: string;
  /** A file to send along, such as the month's hours for the accountant. */
  attachment?: { filename: string; content: Buffer; contentType: string } | null;
};

export type EmailTransport = { send(email: OutgoingEmail): Promise<{ id: string }> };

export const hasResendKey = () => Boolean(process.env.RESEND_API_KEY);

export function resendTransport(): EmailTransport {
  return {
    async send(email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const content = { body: email.body, studioName: email.studioName };
      const [html, text] = [emailHtml(content), emailText(content)];
      const { data, error } = await resend.emails.send(
        {
          from: email.from,
          to: [email.to],
          replyTo: email.replyTo ?? undefined,
          subject: email.subject,
          html,
          text,
          attachments: email.attachment ? [email.attachment] : undefined,
          // Ids only: nothing about the person goes into Resend's tags.
          tags: [{ name: "message", value: email.messageId }],
        },
        { idempotencyKey: `email/${email.messageId}` },
      );
      if (error || !data) throw new Error(error?.message ?? "Resend svarade utan id");
      return { id: data.id };
    },
  };
}

/** What an event says: its type, Resend's id for the email, our message id (from the tag every email carries) and a bounce's type. */
export type WebhookEvent = { type: string; emailId: string | null; messageId: string | null; bounceType: string | null };

/**
 * Checks that a webhook really came from Resend (the signature over the raw
 * body) and reads what it says. Throws when it did not.
 */
export function verifyWebhook(payload: string, headers: { id: string | null; timestamp: string | null; signature: string | null }): WebhookEvent {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) throw new Error("unsigned");
  // Verifying needs no API call, so any key does for the client.
  const resend = new Resend(process.env.RESEND_API_KEY ?? "re_verify_only");
  const event = resend.webhooks.verify({
    payload,
    headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
    webhookSecret: secret,
  }) as { type: string; data?: { email_id?: string; tags?: Record<string, string>; bounce?: { type?: string } } };
  return {
    type: event.type,
    emailId: event.data?.email_id ?? null,
    messageId: event.data?.tags?.message ?? null,
    bounceType: event.data?.bounce?.type ?? null,
  };
}
