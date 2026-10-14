import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studio } from "@/db/schema";
import { receiveLead } from "@/lib/intake/service";
import { watchFirstContact } from "@/lib/notify/start";

export const dynamic = "force-dynamic";

/** Bodies larger than this are refused; a lead is a few kilobytes at most. */
const maxBytes = 64 * 1024;

/** Compares the bearer token with the secret in constant time (both hashed first, so lengths never leak). */
function authorised(header: string | null): boolean {
  const secret = process.env.LEAD_INTAKE_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

const json = (status: number, body: unknown) => Response.json(body, { status });

/**
 * Lead intake (ticket 09): tegen-web POSTs every lead here as a sixth
 * destination. The contract is in docs/lead-intake.md. The lead lands in the
 * pipeline and on the home page; the only thing sent anywhere is a post in
 * the project's Discord test channel if nobody reaches it in time.
 */
export async function POST(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return json(401, { error: "unauthorized" });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) return json(413, { error: "too_large" });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBytes) return json(413, { error: "too_large" });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const [target] = await db
    .select({ id: studio.id })
    .from(studio)
    .where(eq(studio.slug, process.env.LEAD_INTAKE_STUDIO ?? "tegen"))
    .limit(1);
  if (!target) return json(500, { error: "studio_not_found" });

  const result = await receiveLead(db, target.id, body);
  switch (result.status) {
    case "invalid":
      return json(400, { error: "invalid_payload", issues: result.issues });
    case "created":
      // Posts to the test channel on Discord if nobody reaches the lead in time.
      await watchFirstContact(target.id, result.leadId);
      return json(201, result);
    default:
      return json(200, result);
  }
}
