import { start } from "workflow/api";
import { firstContactWorkflow } from "@/workflows/first-contact";

/**
 * Starts the first-contact watch for a new lead (posts to Discord if nobody
 * reaches it in time). Does nothing while no Discord channel is set, and never
 * fails the caller: a lead is saved whether or not the watch starts.
 */
export async function watchFirstContact(studioId: string, leadId: string) {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  try {
    await start(firstContactWorkflow, [studioId, leadId]);
  } catch (error) {
    console.error("Kunde inte starta bevakningen av första kontakt", error instanceof Error ? error.message : error);
  }
}
