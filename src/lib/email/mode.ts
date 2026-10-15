/**
 * When an email may reach a real person (M8). Until the review with Erik it
 * may not: every email goes to Resend's test address instead, and the person
 * it was meant for is only written in our log. Live needs two things at once,
 * the server's EMAIL_LIVE set to "true" and an owner's switch in Tegen HQ, so
 * neither a stray setting nor a click alone can turn it on.
 */

/** Resend's address that accepts every email and delivers it nowhere. */
export const testAddress = "delivered@resend.dev";

/** Who sends while no domain is set: Resend's own address, which only works towards test addresses. */
export const fallbackFrom = "CrossFit Tegen <onboarding@resend.dev>";

/** live: to the real person. test: to the test address. dry_run: no Resend key on this server, so nothing is sent at all. */
export type EmailMode = "live" | "test" | "dry_run";

export function emailMode(input: { hasKey: boolean; serverLive: boolean; ownerLive: boolean }): EmailMode {
  if (!input.hasKey) return "dry_run";
  return input.serverLive && input.ownerLive ? "live" : "test";
}

/** Where an email goes in a mode. */
export const recipientFor = (mode: EmailMode, to: string) => (mode === "live" ? to : testAddress);

export const normaliseAddress = (address: string) => address.trim().toLowerCase();
