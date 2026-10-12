import { db } from "@/db";
import { runApiWatch } from "@/lib/mana/api-watch-service";

export const dynamic = "force-dynamic";

/**
 * Called once a day by Vercel Cron, after the sync: checks Mana's public API
 * spec for changes (ticket 24). Vercel sends the CRON_SECRET as a bearer
 * token, and anything else is turned away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runApiWatch(db);
  return Response.json(
    result.kind === "changed" ? { kind: result.kind, added: result.changes?.added.length ?? 0, removed: result.changes?.removed.length ?? 0 } : result,
  );
}
