import { db } from "@/db";
import { studio } from "@/db/schema";
import { postDailySummary } from "@/lib/notify/service";

export const dynamic = "force-dynamic";

/**
 * Called once a day by Vercel Cron (05:00 UTC, so between 06 and 08 in
 * Stockholm; Hobby crons start some time within their hour): posts the
 * morning summary to the project's Discord test channel, once per day.
 * Vercel sends the CRON_SECRET as a bearer token, and anything else is
 * turned away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const studios = await db.select({ id: studio.id }).from(studio);
  const results = [];
  for (const s of studios) results.push(await postDailySummary(db, s.id));
  return Response.json({ results });
}
