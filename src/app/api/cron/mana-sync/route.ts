import { isNotNull } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { manaSyncWorkflow } from "@/workflows/mana-sync";

export const dynamic = "force-dynamic";

/**
 * Called once a day by Vercel Cron. Vercel sends the CRON_SECRET as a bearer
 * token, and anything else is turned away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const studios = await db
    .select({ studioId: studioSettings.studioId })
    .from(studioSettings)
    .where(isNotNull(studioSettings.manaStudioId));
  const runs = [];
  for (const { studioId } of studios) {
    const run = await start(manaSyncWorkflow, [studioId]);
    runs.push(run.runId);
  }
  return Response.json({ started: runs.length });
}
