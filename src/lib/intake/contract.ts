import { z } from "zod";
import type { ParsedAttribution } from "@/db/schema";

/**
 * The lead intake contract (ticket 09): what tegen-web POSTs for every lead,
 * defined here and handed to Erik (see docs/lead-intake.md). Lenient on
 * purpose: unknown fields are accepted and kept in the stored payload, so the
 * sender never breaks by sending a little more than this.
 */

export const intakeRoutes = ["contact", "qualification", "chat", "escalate"] as const;
export type IntakeRoute = (typeof intakeRoutes)[number];

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .nullish()
  .transform((v) => (v ? v : null));

export const intakePayloadSchema = z
  .object({
    /** The sender's own id for this lead. The same id twice is one lead (retries are safe). */
    id: z.string().trim().min(1).max(200),
    /** Which tegen-web route the lead came through. */
    route: z.enum(intakeRoutes),
    name: z.string().trim().min(1).max(200),
    email: optionalText,
    phone: optionalText,
    /** What the person wrote, if anything. */
    message: optionalText,
    /** The attribution string exactly as formatAttribution builds it. */
    attribution: optionalText,
    landingPage: optionalText,
    /** When the person sent it (ISO 8601); when it arrived if left out. */
    submittedAt: z.iso.datetime({ offset: true }).nullish(),
    /** Qualification answers or anything else worth keeping, stored as sent. */
    answers: z.record(z.string(), z.unknown()).nullish(),
  })
  .loose()
  .refine((p) => p.email || p.phone, { message: "email or phone is required", path: ["email"] });

export type IntakePayload = z.infer<typeof intakePayloadSchema>;

/** Where a lead from each route is shown as coming from. */
export const sourceForRoute: Record<IntakeRoute, string> = {
  contact: "contact_form",
  qualification: "qualification",
  chat: "chat_bot",
  escalate: "chat_bot",
};

/** Words that mark a lead as a test (the same as LAB37's reports). "ignorer" only as a word of its own, so "ignorerat" in a real message is not a test. */
export const testMarkers = /test-lab37|\bignorer\b|testlead/i;

export function isTestLead(p: Pick<IntakePayload, "name" | "email" | "phone" | "message">): boolean {
  return testMarkers.test([p.name, p.email, p.phone, p.message].filter(Boolean).join(" "));
}

/**
 * Splits tegen-web's attribution string into its parts, keeping the string
 * itself untouched elsewhere. The format (formatAttribution): parts joined
 * with " · "; UTM as "source / medium"; "kampanj: <campaign>"; click ids as
 * "<name>: <id>" (gclid, fbclid and so on); "ref: <host>" when only the
 * referring site is known; "Direkt / okänd" for direct. Values are kept whole.
 */
export function parseAttribution(text: string | null): ParsedAttribution | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (/^direkt\s*\/\s*okänd$/i.test(trimmed)) return { direct: true };
  const parsed: ParsedAttribution = {};
  for (const part of trimmed.split(" · ").map((p) => p.trim()).filter(Boolean)) {
    const keyed = /^([A-Za-z_]+):\s*(.+)$/.exec(part);
    if (keyed) {
      const key = keyed[1].toLowerCase();
      const value = keyed[2];
      if (key === "kampanj") parsed.campaign = value;
      else if (key === "ref") parsed.ref = value;
      else parsed.clickIds = { ...parsed.clickIds, [key]: value };
      continue;
    }
    const utm = /^(.+?)\s*\/\s*(.+)$/.exec(part);
    if (utm && parsed.utmSource === undefined) {
      parsed.utmSource = utm[1];
      parsed.utmMedium = utm[2];
    }
  }
  return parsed;
}
