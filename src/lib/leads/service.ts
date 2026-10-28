import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/db";
import { coldReason, lead, leadEvent, leadNote, person, pipelineStage, user } from "@/db/schema";
import { t } from "@/lib/i18n";
import { initialStage, type LeadSource } from "./constants";
import { normalizeEmail, normalizePhone } from "./matching";
import { contactOutcomes, type ContactOutcome } from "@/lib/pipeline/defaults";
import { todayInStockholm } from "@/lib/tasks/dates";

type Db = typeof defaultDb;

export type NewLeadInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  createdById?: string | null;
};

/**
 * Registers a contact. People are recognised by email, then by phone:
 * - a known person with a lead: a note is added to their latest lead and any
 *   missing contact details are filled in (no second lead is made),
 * - a known person without a lead, or whose latest lead is cold: a new lead is
 *   created for them, so someone asking again is seen in Ny lead,
 * - an unknown person: a new person and a new lead are created.
 */
export async function createOrMatchLead(db: Db, studioId: string, input: NewLeadInput) {
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const emailNormalized = normalizeEmail(email);
  const phoneNormalized = normalizePhone(phone);

  return db.transaction(async (tx) => {
    let existing: typeof person.$inferSelect | undefined;
    if (emailNormalized) {
      [existing] = await tx
        .select()
        .from(person)
        .where(and(eq(person.studioId, studioId), eq(person.emailNormalized, emailNormalized)))
        .limit(1);
    }
    if (!existing && phoneNormalized) {
      [existing] = await tx
        .select()
        .from(person)
        .where(and(eq(person.studioId, studioId), eq(person.phoneNormalized, phoneNormalized)))
        .limit(1);
    }

    let thePerson: typeof person.$inferSelect;
    if (existing) {
      [thePerson] = await tx
        .update(person)
        .set({
          email: existing.email ?? email,
          emailNormalized: existing.emailNormalized ?? emailNormalized,
          phone: existing.phone ?? phone,
          phoneNormalized: existing.phoneNormalized ?? phoneNormalized,
          updatedAt: new Date(),
        })
        .where(eq(person.id, existing.id))
        .returning();

      const [latest] = await tx
        .select({ id: lead.id, kind: pipelineStage.kind })
        .from(lead)
        .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
        .where(eq(lead.personId, existing.id))
        .orderBy(desc(lead.createdAt))
        .limit(1);
      if (latest && latest.kind !== "cold") {
        const details = [input.name, email, phone].filter(Boolean).join(", ");
        await tx.insert(leadNote).values({
          studioId,
          leadId: latest.id,
          body: t("lead.duplicateNote", { details }),
          authorId: input.createdById ?? null,
        });
        const [touched] = await tx
          .update(lead)
          .set({ updatedAt: new Date() })
          .where(eq(lead.id, latest.id))
          .returning();
        return { lead: touched, person: thePerson, duplicate: true };
      }
    } else {
      [thePerson] = await tx
        .insert(person)
        .values({
          studioId,
          name: input.name.trim(),
          email,
          emailNormalized,
          phone,
          phoneNormalized,
        })
        .returning();
    }

    const [created] = await tx
      .insert(lead)
      .values({
        studioId,
        personId: thePerson.id,
        source: input.source,
        stage: initialStage,
        createdById: input.createdById ?? null,
      })
      .returning();
    return { lead: created, person: thePerson, duplicate: false };
  });
}

/**
 * All leads of a studio with their person, stage, assignee and task counts,
 * newest first. "Overdue" means open tasks whose day is before today (in
 * Tegen's time zone).
 */
export async function listLeads(db: Db, studioId: string, today: string = todayInStockholm()) {
  const assignee = alias(user, "assignee");
  return db
    .select({
      lead,
      person,
      stage: pipelineStage,
      assigneeName: assignee.name,
      openTasks: sql<number>`(select count(*)::int from task t where t.lead_id = ${lead.id} and t.done_at is null)`,
      overdueTasks: sql<number>`(select count(*)::int from task t where t.lead_id = ${lead.id} and t.done_at is null and t.due_date < ${today})`,
    })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(
      pipelineStage,
      and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)),
    )
    .leftJoin(assignee, eq(assignee.id, lead.assignedToId))
    .where(eq(lead.studioId, studioId))
    .orderBy(desc(lead.createdAt));
}

export type HistoryItem =
  | { kind: "note"; id: string; at: Date; authorName: string | null; body: string; private?: boolean }
  | {
      kind: "stage_changed";
      id: string;
      at: Date;
      authorName: string | null;
      fromStage: string | null;
      toStage: string | null;
      coldReason: string | null;
      via: string | null;
    }
  | { kind: "contact_logged"; id: string; at: Date; authorName: string | null; outcome: string };

/**
 * One lead with its person, its current stage and its history (notes, stage
 * moves and logged contacts together, newest first). Null when the lead does
 * not belong to the studio.
 */
export async function getLead(db: Db, studioId: string, leadId: string) {
  const assignee = alias(user, "assignee");
  const [found] = await db
    .select({ lead, person, stage: pipelineStage, assigneeName: assignee.name })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(
      pipelineStage,
      and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)),
    )
    .leftJoin(assignee, eq(assignee.id, lead.assignedToId))
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!found) return null;

  const [notes, events] = await Promise.all([
    db
      .select({
        id: leadNote.id,
        body: leadNote.body,
        private: leadNote.private,
        createdAt: leadNote.createdAt,
        authorName: user.name,
      })
      .from(leadNote)
      .leftJoin(user, eq(user.id, leadNote.authorId))
      .where(and(eq(leadNote.studioId, studioId), eq(leadNote.leadId, leadId))),
    db
      .select({
        id: leadEvent.id,
        type: leadEvent.type,
        fromStage: leadEvent.fromStage,
        toStage: leadEvent.toStage,
        coldReason: leadEvent.coldReason,
        outcome: leadEvent.outcome,
        via: leadEvent.via,
        createdAt: leadEvent.createdAt,
        authorName: user.name,
      })
      .from(leadEvent)
      .leftJoin(user, eq(user.id, leadEvent.authorId))
      .where(and(eq(leadEvent.studioId, studioId), eq(leadEvent.leadId, leadId))),
  ]);

  const history: HistoryItem[] = [
    ...notes.map((n): HistoryItem => ({
      kind: "note",
      id: n.id,
      at: n.createdAt,
      authorName: n.authorName,
      body: n.body,
      private: n.private,
    })),
    ...events.map((e): HistoryItem =>
      e.type === "contact_logged"
        ? { kind: "contact_logged", id: e.id, at: e.createdAt, authorName: e.authorName, outcome: e.outcome ?? "" }
        : {
            kind: "stage_changed",
            id: e.id,
            at: e.createdAt,
            authorName: e.authorName,
            fromStage: e.fromStage,
            toStage: e.toStage,
            coldReason: e.coldReason,
            via: e.via,
          },
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    lead: found.lead,
    person: found.person,
    stage: found.stage,
    assigneeName: found.assigneeName,
    history,
  };
}

export class LeadError extends Error {
  constructor(public code: "not_found" | "unknown_stage" | "cold_reason_required" | "unknown_outcome") {
    super(code);
  }
}

/**
 * Moves a lead to a stage and records who did it. A cold stage needs one of
 * the studio's Cold reasons. Leaving a cold stage clears the reason from the
 * lead (the history still shows it). Moving to the same stage does nothing.
 */
export async function moveLeadStage(
  db: Db,
  studioId: string,
  leadId: string,
  toStage: string,
  options: { coldReason?: string | null; authorId?: string | null; via?: string | null } = {},
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(lead)
      .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
      .limit(1);
    if (!current) throw new LeadError("not_found");

    const [target] = await tx
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.studioId, studioId), eq(pipelineStage.key, toStage)))
      .limit(1);
    if (!target) throw new LeadError("unknown_stage");

    let reason: string | null = null;
    if (target.kind === "cold") {
      const [found] = options.coldReason
        ? await tx
            .select()
            .from(coldReason)
            .where(and(eq(coldReason.studioId, studioId), eq(coldReason.key, options.coldReason)))
            .limit(1)
        : [];
      if (!found) throw new LeadError("cold_reason_required");
      reason = found.key;
    }

    if (current.stage === target.key && (current.coldReason ?? null) === reason) return current;

    const [updated] = await tx
      .update(lead)
      .set({ stage: target.key, coldReason: reason, updatedAt: new Date() })
      .where(eq(lead.id, leadId))
      .returning();
    await tx.insert(leadEvent).values({
      studioId,
      leadId,
      type: "stage_changed",
      fromStage: current.stage,
      toStage: target.key,
      coldReason: reason,
      authorId: options.authorId ?? null,
      via: options.via ?? null,
    });
    return updated;
  });
}

/**
 * Records what happened after contacting someone (called, no answer, emailed,
 * booked). A lead still in the first stage moves on to "contacted", so one tap
 * is enough.
 */
export async function logContact(
  db: Db,
  studioId: string,
  leadId: string,
  outcome: string,
  authorId: string | null,
) {
  if (!(contactOutcomes as readonly string[]).includes(outcome)) throw new LeadError("unknown_outcome");
  const found = await getLead(db, studioId, leadId);
  if (!found) throw new LeadError("not_found");

  await db.insert(leadEvent).values({
    studioId,
    leadId,
    type: "contact_logged",
    outcome: outcome as ContactOutcome,
    authorId,
  });
  await db.update(lead).set({ updatedAt: new Date() }).where(eq(lead.id, leadId));
  if (found.lead.stage === initialStage) {
    await moveLeadStage(db, studioId, leadId, "contacted", { authorId });
  }
}

export async function addNote(
  db: Db,
  studioId: string,
  leadId: string,
  body: string,
  authorId: string | null,
  options: { private?: boolean } = {},
) {
  const found = await getLead(db, studioId, leadId);
  if (!found) return null;
  const [note] = await db
    .insert(leadNote)
    .values({ studioId, leadId, body: body.trim(), authorId, private: options.private ?? false })
    .returning();
  await db.update(lead).set({ updatedAt: new Date() }).where(eq(lead.id, leadId));
  return note;
}
