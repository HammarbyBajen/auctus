/**
 * Posts to the project's Discord channel through a webhook (DISCORD_WEBHOOK_URL).
 * Until the review with Erik (ticket 18) that is a test channel only Max and
 * Erik see, never Fredrik or Timmy.
 *
 * - Only a discord.com webhook address is used, so the message can go nowhere else.
 * - Nobody is ever pinged: mentions are switched off for every post.
 * - It never throws, and what it reports never contains the address, which
 *   works as a password for the channel.
 */

export type PostResult = "sent" | "disabled" | "failed";

const webhookPattern = /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

export async function postToDiscord(
  content: string,
  options: { url?: string | undefined; fetchFn?: typeof fetch } = {},
): Promise<PostResult> {
  const url = options.url ?? process.env.DISCORD_WEBHOOK_URL;
  if (!url || !webhookPattern.test(url)) return "disabled";
  try {
    const response = await (options.fetchFn ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** The address links in a post point to: APP_URL, or the production address Vercel gives the app. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
