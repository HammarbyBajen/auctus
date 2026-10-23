import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/db";
import { leadSubmission, studioSettings } from "@/db/schema";
import { getHomeData } from "@/lib/home/service";
import { addNote, getLead, logContact, moveLeadStage } from "@/lib/leads/service";
import { listAtRisk } from "@/lib/mana/at-risk-service";
import { getManaInfo } from "@/lib/mana/leads";
import { can, type Resource } from "@/lib/permissions";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { listStages } from "@/lib/pipeline/service";
import { todayInStockholm } from "@/lib/tasks/dates";
import { createTask, listTasksForLead } from "@/lib/tasks/service";
import { firstNameOnly, mentionsHealth, notesForAi, withoutContactDetails } from "./privacy";

/**
 * What the assistant may read and do (ticket 30), written once: the built-in
 * assistant uses these now, the MCP server will expose the same ones later.
 * Each checks the person's role, as the pages do, and returns only what may
 * be sent to an AI: first names, stages, dates and outcomes, and notes that
 * passed the privacy filter. Never phone numbers, email addresses or health.
 *
 * The AI never acts. It proposes steps (`stepSchema`); `applySteps` carries
 * them out only when a person has approved them, as that person.
 */

type Db = typeof defaultDb;

/** Who is asking: the signed-in person. */
export type Actor = { id: string; studioId: string; role: string | null };

export class AiToolError extends Error {
  constructor(public code: "not_allowed" | "not_found") {
    super(code);
  }
}

function allow(actor: Actor, resource: Resource, action: string) {
  if (!can(actor.role, resource, action)) throw new AiToolError("not_allowed");
}

export async function studioHealthTerms(db: Db, studioId: string): Promise<string[]> {
  const [row] = await db.select({ ai: studioSettings.aiSettings }).from(studioSettings).where(eq(studioSettings.studioId, studioId)).limit(1);
  return row?.ai?.healthTerms ?? [];
}

const dayOf = (at: Date) => todayInStockholm(at);
const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / 86_400_000);

/** The page the form was filled in on, without its query (no click ids or tracking). */
function pathOf(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * One lead, as the assistant may see it: for a brief before a call, or to
 * understand a note written after one.
 */
export async function leadContext(db: Db, actor: Actor, leadId: string, now: Date = new Date()) {
  allow(actor, "leads", "read");
  const found = await getLead(db, actor.studioId, leadId);
  if (!found) throw new AiToolError("not_found");
  const { lead, person, stage, history } = found;
  const [stages, [submission], mana, tasks, terms] = await Promise.all([
    listStages(db, actor.studioId, { includeArchived: true }),
    db
      .select({ route: leadSubmission.route, payload: leadSubmission.payload })
      .from(leadSubmission)
      .where(and(eq(leadSubmission.studioId, actor.studioId), eq(leadSubmission.leadId, leadId)))
      .orderBy(desc(leadSubmission.receivedAt))
      .limit(1),
    getManaInfo(db, actor.studioId, person.manaUserId),
    listTasksForLead(db, actor.studioId, leadId),
    studioHealthTerms(db, actor.studioId),
  ]);
  const stageName = (key: string | null) => stages.find((s) => s.key === key)?.name ?? key;

  const notes = notesForAi(
    history.filter((h) => h.kind === "note").map((h) => ({ on: dayOf(h.at), body: h.body, private: h.private ?? false })),
    terms,
  );
  type Event =
    | { on: string; what: "contact"; outcome: string }
    | { on: string; what: "stage"; from: string | null; to: string | null; coldReason: string | null };
  const events = history.flatMap((h): Event[] =>
    h.kind === "contact_logged"
      ? [{ on: dayOf(h.at), what: "contact", outcome: h.outcome }]
      : h.kind === "stage_changed"
        ? [{ on: dayOf(h.at), what: "stage", from: stageName(h.fromStage), to: stageName(h.toStage), coldReason: h.coldReason }]
        : [],
  );
  // A task's title is free text like a note, and goes through the same filter.
  const openTasks = notesForAi(tasks.open.map((t) => ({ due: t.dueDate, body: t.title })), terms);
  const payload = (submission?.payload ?? {}) as { answers?: Record<string, unknown>; landingPage?: unknown };
  const answers = Object.fromEntries(
    Object.entries(payload.answers ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !mentionsHealth(entry[1], terms))
      .map(([key, value]) => [key, withoutContactDetails(value)]),
  );
  const lastContact = history.find((h) => h.kind === "contact_logged");
  const attribution = lead.attributionParsed;

  return {
    leadId,
    firstName: firstNameOnly(person.name),
    stage: stage.name,
    stageKind: stage.kind,
    source: lead.source,
    arrivedOn: dayOf(lead.createdAt),
    daysSinceArrived: daysBetween(lead.createdAt, now),
    daysSinceLastContact: lastContact ? daysBetween(lastContact.at, now) : null,
    form: submission ? { route: submission.route, answers, page: pathOf(payload.landingPage) } : null,
    cameFrom: attribution
      ? {
          direct: attribution.direct ?? false,
          utmSource: attribution.utmSource ?? null,
          utmMedium: attribution.utmMedium ?? null,
          campaign: attribution.campaign ?? null,
          fromAnAd: Boolean(attribution.clickIds && Object.keys(attribution.clickIds).length > 0),
          referrer: attribution.ref ?? null,
        }
      : null,
    notes: notes.sent.map(({ on, body }) => ({ on, body })),
    notesHeldBack: notes.withheld,
    events,
    openTasks: openTasks.sent.map(({ due, body }) => ({ due, title: body })),
    tasksHeldBack: openTasks.withheld,
    inMana: mana ? { member: mana.counting.length > 0, memberships: mana.counting.map((m) => m.name) } : null,
  };
}

export type LeadContext = Awaited<ReturnType<typeof leadContext>>;

/** The leads that need attention on Home, as the assistant may see them, to rank or summarize. */
export async function attentionList(db: Db, actor: Actor, scope: "mine" | "all" = "all", now: Date = new Date()) {
  allow(actor, "leads", "read");
  const { items } = await getHomeData(db, actor.studioId, actor.id, scope, now);
  return items.map((item) => ({
    leadId: item.lead.id,
    firstName: firstNameOnly(item.lead.personName),
    stage: item.lead.stage,
    group: item.group,
    severity: item.severity,
    reasons: item.reasons.map((r) => r.type),
    daysSinceArrived: daysBetween(item.lead.createdAt, now),
    daysSinceActivity: daysBetween(item.lead.updatedAt, now),
  }));
}

/** The members on Hör av dig till, as the assistant may see them: how long away, memberships, what staff tried. */
export async function atRiskList(db: Db, actor: Actor, now: Date = new Date()) {
  allow(actor, "leads", "read");
  const [rows, terms] = await Promise.all([listAtRisk(db, actor.studioId, now), studioHealthTerms(db, actor.studioId)]);
  return rows.map((row) => {
    const notes = notesForAi(row.notes.map((n) => ({ on: dayOf(n.at), kind: n.kind, body: n.body, private: n.private ?? false })), terms);
    return {
      alertId: row.id,
      firstName: firstNameOnly(row.name),
      group: row.group,
      daysAway: daysBetween(row.lastVisitAt ?? row.since, now),
      memberships: row.memberships,
      attempts: row.attempts,
      notes: notes.sent.map(({ on, kind, body }) => ({ on, kind, body })),
      notesHeldBack: notes.withheld,
    };
  });
}

/** A step the AI may propose on a lead. Nothing happens until a person approves it. */
export const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("log_contact"), outcome: z.enum(contactOutcomes) }),
  z.object({ type: z.literal("add_note"), body: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("create_task"), title: z.string().min(1).max(200), dueDate: z.iso.date() }),
  z.object({ type: z.literal("move_stage"), stage: z.string().min(1), coldReason: z.string().nullable() }),
]);
export type Step = z.infer<typeof stepSchema>;

/**
 * Carries out the steps a person approved, as that person, through the same
 * services the pages use (so a stage that does not exist, or a Cold move
 * without a reason, is refused the same way). All or nothing: in one
 * transaction, so a step that is refused leaves none of the others behind.
 */
export async function applySteps(db: Db, actor: Actor, leadId: string, steps: Step[]) {
  allow(actor, "leads", "write");
  const parsed = z.array(stepSchema).parse(steps);
  await db.transaction(async (tx) => {
    // The services take the database; a transaction answers the same calls (their own transactions become savepoints).
    const t = tx as unknown as Db;
    if (!(await getLead(t, actor.studioId, leadId))) throw new AiToolError("not_found");
    for (const step of parsed) {
      if (step.type === "log_contact") await logContact(t, actor.studioId, leadId, step.outcome, actor.id);
      else if (step.type === "add_note") await addNote(t, actor.studioId, leadId, step.body, actor.id);
      else if (step.type === "create_task") await createTask(t, actor.studioId, leadId, { title: step.title, dueDate: step.dueDate }, actor.id);
      else await moveLeadStage(t, actor.studioId, leadId, step.stage, { coldReason: step.coldReason, authorId: actor.id });
    }
  });
}
