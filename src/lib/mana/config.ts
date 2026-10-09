import "server-only";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { studioSettings } from "@/db/schema";
import { ManaClient } from "./client";
import { ManaError } from "./errors";

type Db = typeof defaultDb;

/**
 * Builds the client for a studio. The studio id and address come from the
 * studio's settings. The API key comes only from the environment, and this
 * module is server-only, so it can never reach the browser.
 */
export async function createManaClient(
  db: Db,
  studioId: string,
  lastRequestAt: number | null = null,
  options: { maxRetries?: number } = {},
) {
  const [settings] = await db
    .select({ manaStudioId: studioSettings.manaStudioId, manaBaseUrl: studioSettings.manaBaseUrl })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  if (!settings?.manaStudioId) {
    throw new ManaError("not_configured", "Mana är inte kopplat: studions Mana-id saknas i inställningarna.");
  }
  const apiKey = process.env.MANA_API_KEY;
  if (!apiKey) {
    throw new ManaError("not_configured", "Mana är inte kopplat: nyckeln saknas på servern.");
  }
  return new ManaClient({
    baseUrl: settings.manaBaseUrl,
    studioId: settings.manaStudioId,
    apiKey,
    lastRequestAt,
    maxRetries: options.maxRetries,
  });
}
