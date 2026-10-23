import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/db";
import { discordNotice } from "@/db/schema";
import { appUrl, postToDiscord, type PostResult } from "@/lib/notify/discord";
import { postOnce } from "@/lib/notify/service";
import { can } from "@/lib/permissions";
import { todayInStockholm } from "@/lib/tasks/dates";
import { askAi, hasAiKey, type AiResult, type AiTransport } from "./client";
import { buildFacts, weekStart } from "./facts";
import { withoutContactDetails } from "./privacy";
import { AiToolError, type Actor } from "./tools";

/**
 * Phase E of the assistant (ticket 30): owners ask in plain Swedish and get
 * an answer from Tegen HQ's own figures, and a summary of the week goes to
 * the owners' Discord channel on Monday mornings. The figures are worked out
 * in Tegen HQ (./facts); the AI only reads them and puts them into words.
 */

type Db = typeof defaultDb;

// ---- Questions ----

export const answerSchema = z.object({
  answer: z.string().describe("The answer in Swedish, two to five short sentences, with the numbers."),
  figures: z.array(z.object({ label: z.string(), value: z.string() })).describe("Up to six key numbers behind the answer, as short labels and values."),
  basis: z.string().describe("One short sentence in Swedish on which figures (or which routine in Handbok) the answer rests on."),
  unsure: z.boolean().describe("True when the figures do not answer the question well."),
});
export type OwnerAnswer = z.infer<typeof answerSchema>;

const answerSystem = `Du svarar på frågor från ägarna till CrossFit Tegen, ett CrossFit-gym i Stockholm, om deras verksamhet.

Du får Tegen HQ:s egna siffror som JSON: leads per månad, källa och kampanj, hur många som blev medlemmar, varför leads blev kalla, medlemmar och intäkter, uppsägningar och frysningar som är på gång, medlemmar som inte varit på gymmet, coachernas timmar och Tegens rutiner (Handbok). Personer anges bara med förnamn. Siffrorna är räknade i Tegen HQ; räkna inte om dem på egen hand om du inte måste, och visa i så fall hur.

Svara så här:
- På svenska, kort och rakt, med siffrorna.
- Bara utifrån underlaget. Står svaret inte där, säg det och säg vilken siffra som saknas. Gissa aldrig.
- Gäller frågan en rutin, svara utifrån Handbok och nämn rutinens rubrik.
- Nämn aldrig hälsa, skador eller sjukdom hos en namngiven person.`;

/** An owner's question, answered from the figures. Owners only. */
export async function askOwnerQuestion(db: Db, actor: Actor, question: string, transport?: AiTransport, now: Date = new Date()): Promise<AiResult<OwnerAnswer>> {
  if (!can(actor.role, "kpi", "read")) throw new AiToolError("not_allowed");
  const facts = await buildFacts(db, actor.studioId, now);
  const prompt = JSON.stringify({ question: withoutContactDetails(question.trim().slice(0, 500)), figures: facts });
  return askAi(db, { studioId: actor.studioId, userId: actor.id, kind: "owner_question" }, { system: answerSystem, prompt, schema: answerSchema, effort: "medium" }, transport, now);
}

// ---- The weekly summary ----

export const summarySchema = z.object({
  headline: z.string().describe("One sentence in Swedish: how the week went."),
  points: z.array(z.string()).describe("Three to six short points in Swedish with the week's numbers: leads, who joined, who is leaving or pausing, who is away."),
  watch: z.array(z.string()).describe("Up to three things worth doing this week, in Swedish."),
});
export type WeeklySummary = z.infer<typeof summarySchema>;

const summarySystem = `Du skriver en kort veckosammanfattning till ägarna till CrossFit Tegen, ett CrossFit-gym i Stockholm. Den läses i Discord på måndagsmorgonen.

Du får Tegen HQ:s egna siffror som JSON. "leads.lastWeek" är förra veckan (måndag till söndag). Personer anges bara med förnamn.

Skriv så här:
- Svenska, kort, sakligt och vänligt. Inga utropstecken.
- Bara utifrån siffrorna. Hitta inte på orsaker.
- Ta med: nya leads och varifrån, vilka som blev medlemmar, uppsägningar och frysningar som är på gång, medlemmar som inte varit på gymmet.
- Förnamn går bra. Nämn aldrig hälsa, skador eller sjukdom.
- Under "watch": det som är värt att göra den här veckan, till exempel att ringa de som säger upp.`;

/** Discord's text for the summary: a heading, the points, what to do, and a link. Under Discord's 2 000 characters. */
export function summaryMessage(summary: WeeklySummary, week: string): string {
  const lines = [`**Veckan som gick (vecka från ${week})**`, summary.headline, "", ...summary.points.map((p) => `• ${p}`)];
  if (summary.watch.length > 0) lines.push("", "**Den här veckan**", ...summary.watch.map((w) => `• ${w}`));
  lines.push("", `${appUrl()}/`);
  return lines.join("\n").slice(0, 1990);
}

/**
 * The summary for the week that just ended, posted once, on Mondays, when the
 * assistant has a key. A retried cron finds it already sent and asks nothing.
 */
export async function postWeeklySummary(
  db: Db,
  studioId: string,
  now: Date = new Date(),
  post: (content: string) => Promise<PostResult> = postToDiscord,
  transport?: AiTransport,
): Promise<"not_monday" | "not_configured" | "already_sent" | "failed" | PostResult> {
  const today = todayInStockholm(now);
  if (weekStart(today) !== today) return "not_monday";
  if (!hasAiKey()) return "not_configured";
  const key = `weekly:${today}`;
  const [sent] = await db.select({ key: discordNotice.key }).from(discordNotice).where(and(eq(discordNotice.studioId, studioId), eq(discordNotice.key, key))).limit(1);
  if (sent) return "already_sent";

  const facts = await buildFacts(db, studioId, now);
  const result = await askAi(db, { studioId, userId: null, kind: "weekly_summary" }, { system: summarySystem, prompt: JSON.stringify(facts), schema: summarySchema, effort: "medium" }, transport, now);
  if (result.status !== "ok") return result.status === "not_configured" ? "not_configured" : "failed";
  const lastMonday = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  return postOnce(db, studioId, key, summaryMessage(result.output, lastMonday), post);
}
