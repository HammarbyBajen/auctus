import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/db";
import { emailMessage, lead, manaMember, person } from "@/db/schema";
import { alertMember } from "@/lib/mana/at-risk-service";
import { todayInStockholm } from "@/lib/tasks/dates";
import { askAi, type AiResult, type AiTransport } from "./client";
import { firstNameOnly, mentionsHealth, withoutContactDetails } from "./privacy";
import { atRiskList, leadContext, studioHealthTerms, type Actor } from "./tools";

/**
 * Phase D of the assistant (ticket 30): an email draft for a lead or a member
 * on the Medlemmar list, in Tegen's own tone. The tone is learnt from emails
 * staff sent from Tegen HQ before (decided by Max, 2026-10-23); each example
 * is about someone else, so it is cleaned first: their name becomes [namn],
 * contact details go, and an example with signs of health information is left
 * out whole. The draft lands in the form; a person edits it and sends it.
 */

type Db = typeof defaultDb;

export const draftSchema = z.object({
  subject: z.string().describe("A short subject line in Swedish, no exclamation marks."),
  body: z.string().describe("The email text in Swedish, plain text with blank lines between paragraphs, signed with the sender's first name."),
});
export type EmailDraft = z.infer<typeof draftSchema>;

export type DraftKind = "lead" | "member";

/** How many earlier emails are shown as examples of Tegen's tone. */
const exampleCount = 5;
/** The most of an example's text that is sent. */
const exampleLength = 1500;

/** Every word of a name, swapped for [namn] wherever it stands alone in a text. */
export function withoutName(text: string, name: string | null): string {
  const parts = (name ?? "")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}-]/gu, ""))
    .filter((p) => p.length >= 2);
  return parts.reduce((out, part) => out.replace(new RegExp(`(?<![\\p{L}])${part}(?![\\p{L}])`, "giu"), "[namn]"), text);
}

/**
 * Up to five recent emails staff sent from Tegen HQ to the same kind of
 * person, cleaned: no names, no contact details, none with health words.
 */
export async function toneExamples(db: Db, studioId: string, kind: DraftKind, terms: readonly string[]) {
  const about = kind === "lead" ? isNotNull(emailMessage.leadId) : isNotNull(emailMessage.manaUserId);
  const rows = await db
    .select({ subject: emailMessage.subject, body: emailMessage.body, leadId: emailMessage.leadId, manaUserId: emailMessage.manaUserId })
    .from(emailMessage)
    .where(and(eq(emailMessage.studioId, studioId), isNotNull(emailMessage.sentById), about))
    .orderBy(desc(emailMessage.createdAt))
    .limit(exampleCount * 4);
  if (rows.length === 0) return [];

  // Whom each email was to, so their name can be taken out.
  const leadIds = rows.map((r) => r.leadId).filter((id): id is string => Boolean(id));
  const memberIds = rows.map((r) => r.manaUserId).filter((id): id is string => Boolean(id));
  const [leadNames, memberNames] = await Promise.all([
    leadIds.length > 0
      ? db.select({ id: lead.id, name: person.name }).from(lead).innerJoin(person, eq(person.id, lead.personId)).where(and(eq(lead.studioId, studioId), inArray(lead.id, leadIds)))
      : [],
    memberIds.length > 0
      ? db.select({ id: manaMember.manaUserId, name: manaMember.name }).from(manaMember).where(and(eq(manaMember.studioId, studioId), inArray(manaMember.manaUserId, memberIds)))
      : [],
  ]);
  const nameOf = new Map<string, string | null>([...leadNames, ...memberNames].map((n) => [n.id, n.name]));

  const seen = new Set<string>();
  const out: { subject: string; body: string }[] = [];
  for (const r of rows) {
    if (mentionsHealth(`${r.subject}\n${r.body}`, terms)) continue;
    const name = nameOf.get(r.leadId ?? r.manaUserId ?? "") ?? null;
    const clean = (text: string) => withoutContactDetails(withoutName(text, name));
    const example = { subject: clean(r.subject), body: clean(r.body).slice(0, exampleLength) };
    // The same template sent to many is one example.
    if (seen.has(example.body)) continue;
    seen.add(example.body);
    out.push(example);
    if (out.length === exampleCount) break;
  }
  return out;
}

const draftSystem = `Du skriver utkast till e-post från personalen på CrossFit Tegen, ett CrossFit-gym i Stockholm. En person läser utkastet, ändrar det och skickar det själv.

Du får som JSON: vem mejlet är till (en lead som visat intresse för att börja träna, eller en medlem som inte varit på gymmet på ett tag), deras läge, avsändarens förnamn, tidigare mejl från Tegen som exempel på tonen, och ibland ett påbörjat utkast.

Skriv så här:
- Svenska, kort och personligt, som en människa på gymmet skriver, inte som reklam.
- Härma tonen i exemplen om det finns några: hälsning, längd, ordval och avslutning. Kopiera inte deras innehåll. [namn] i exemplen står för en annan person.
- Använd bara fakta i underlaget. Hitta aldrig på priser, erbjudanden, tider eller datum.
- Nämn aldrig hälsa, skador eller sjukdom.
- Börja med "Hej" och förnamnet. Avsluta med avsändarens förnamn om det finns.
- Till en lead: målet är att boka en provträning eller ett möte. Föreslå inga tider; be dem svara med vad som passar.
- Till en medlem: hör hur det är och säg att ni saknar dem. Ingen press och inget säljande.
- Finns ett påbörjat utkast, utgå från det och behåll det personalen redan skrivit.
- Ämnesraden kort, utan utropstecken.`;

type Current = { subject: string; body: string };

/** The staff member's own unsent text, if it may be sent: no health words, no contact details. */
function startingPoint(current: Current, terms: readonly string[]) {
  const text = `${current.subject}\n${current.body}`.trim();
  if (!text || mentionsHealth(text, terms)) return null;
  return { subject: withoutContactDetails(current.subject), body: withoutContactDetails(current.body) };
}

async function draft(db: Db, actor: Actor, kind: DraftKind, about: { leadId?: string; manaUserId?: string }, recipient: unknown, current: Current, sender: string | null, transport?: AiTransport, now: Date = new Date()) {
  const terms = await studioHealthTerms(db, actor.studioId);
  const examples = await toneExamples(db, actor.studioId, kind, terms);
  const prompt = JSON.stringify({
    today: todayInStockholm(now),
    to: kind,
    recipient,
    sender: firstNameOnly(sender) || null,
    examples,
    draft: startingPoint(current, terms),
  });
  return askAi(db, { studioId: actor.studioId, userId: actor.id, kind: "email_draft", leadId: about.leadId ?? null, manaUserId: about.manaUserId ?? null }, { system: draftSystem, prompt, schema: draftSchema, effort: "low" }, transport, now);
}

/** A draft to a lead, from what has happened on the lead (the same filtered view as the brief before a call). */
export async function draftLeadEmail(db: Db, actor: Actor, leadId: string, current: Current, sender: string | null, transport?: AiTransport, now: Date = new Date()): Promise<AiResult<EmailDraft>> {
  const context = await leadContext(db, actor, leadId, now);
  return draft(db, actor, "lead", { leadId }, context, current, sender, transport, now);
}

/** A draft to a member on the Medlemmar list: how long they have been away, their memberships, what staff tried. */
export async function draftMemberEmail(db: Db, actor: Actor, alertId: string, current: Current, sender: string | null, transport?: AiTransport, now: Date = new Date()): Promise<AiResult<EmailDraft> | { status: "not_found" }> {
  const [row, member] = await Promise.all([
    atRiskList(db, actor, now).then((rows) => rows.find((r) => r.alertId === alertId)),
    alertMember(db, actor.studioId, alertId),
  ]);
  if (!row || !member) return { status: "not_found" };
  const recipient = { firstName: row.firstName, group: row.group, daysAway: row.daysAway, memberships: row.memberships, attempts: row.attempts, notes: row.notes, notesHeldBack: row.notesHeldBack };
  // Logged under the member, so a privacy deletion takes the draft too.
  return draft(db, actor, "member", { manaUserId: member.manaUserId }, recipient, current, sender, transport, now);
}
