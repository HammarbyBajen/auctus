import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studio } from "@/db/schema";
import { receiveLead, recordRejection, type Rejection } from "@/lib/intake/service";
import { watchFirstContact } from "@/lib/notify/start";

export const dynamic = "force-dynamic";

/** Bodies larger than this are refused; a lead is a few kilobytes at most. */
const maxBytes = 64 * 1024;

/**
 * Checks the bearer token against the secret in constant time (both hashed
 * first, so lengths never leak), and says why it failed: no header, not a
 * bearer token, another secret, or no secret on this server.
 */
function authorise(header: string | null): "ok" | "missing" | "malformed" | "wrong" | "not_configured" {
  const secret = process.env.LEAD_INTAKE_SECRET;
  if (!secret) return "not_configured";
  if (!header) return "missing";
  if (!header.startsWith("Bearer ")) return "malformed";
  const given = createHash("sha256").update(header.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected) ? "ok" : "wrong";
}

const json = (status: number, body: unknown) => Response.json(body, { status });

/**
 * Lead intake (ticket 09): tegen-web POSTs every lead here as a sixth
 * destination. The contract is in docs/lead-intake.md. The lead lands in the
 * pipeline and on the home page; the only thing sent anywhere is a post in
 * the project's Discord test channel if nobody reaches it in time. A call
 * turned away is noted (why, never what it said) under Inställningar →
 * Inkommande leads, so a sender whose leads never arrive can be seen.
 */
export async function POST(request: Request) {
  const [target] = await db
    .select({ id: studio.id })
    .from(studio)
    .where(eq(studio.slug, process.env.LEAD_INTAKE_STUDIO ?? "tegen"))
    .limit(1);
  if (!target) return json(500, { error: "studio_not_found" });

  const userAgent = request.headers.get("user-agent");
  const reject = async (status: number, body: unknown, rejection: Rejection) => {
    // Noting it must never change the answer the sender gets.
    await recordRejection(db, target.id, { userAgent, ...rejection }).catch((error) =>
      console.error("Kunde inte notera ett avvisat intag", error instanceof Error ? error.message : error),
    );
    return json(status, body);
  };

  const auth = authorise(request.headers.get("authorization"));
  if (auth !== "ok") return reject(401, { error: "unauthorized" }, { reason: "unauthorized", detail: auth });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) return reject(413, { error: "too_large" }, { reason: "too_large", bytes: length });

  let body: unknown;
  let text = "";
  try {
    text = await request.text();
    if (text.length > maxBytes) return reject(413, { error: "too_large" }, { reason: "too_large", bytes: text.length });
    body = JSON.parse(text);
  } catch {
    return reject(400, { error: "invalid_json" }, { reason: "invalid_json", bytes: text.length });
  }

  const result = await receiveLead(db, target.id, body);
  switch (result.status) {
    case "invalid":
      return reject(400, { error: "invalid_payload", issues: result.issues }, { reason: "invalid_payload", body, issues: result.issues, bytes: text.length });
    case "created":
      // Posts to the test channel on Discord if nobody reaches the lead in time.
      await watchFirstContact(target.id, result.leadId);
      return json(201, result);
    default:
      return json(200, result);
  }
}
