import { db } from "@/db";
import { handleEmailEvent } from "@/lib/email/service";
import { verifyWebhook } from "@/lib/email/transport";

export const dynamic = "force-dynamic";

/**
 * Resend reports what happened to each email here (M8): delivered, delayed,
 * bounced, complained, failed. The signature is checked on the raw body
 * before anything is read; anything unsigned is turned away. Each event is
 * handled once, so Resend's retries change nothing.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const id = request.headers.get("svix-id");
  let event;
  try {
    event = verifyWebhook(payload, { id, timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") });
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }
  await handleEmailEvent(db, id!, event);
  return Response.json({ ok: true });
}
