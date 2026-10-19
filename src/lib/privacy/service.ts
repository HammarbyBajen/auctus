import { and, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { aiSuggestion, atRiskAlert, atRiskNote, deletionLog, emailMessage, lead, leadNote, leadSubmission, person, pipelineStage, task } from "@/db/schema";

type Db = typeof defaultDb;

/**
 * Privacy tools (ticket 17). Nothing here runs by itself: every deletion is an
 * owner's explicit, confirmed choice.
 */

/** What deleting a person would remove, to show before anyone confirms. */
export async function deletionPreview(db: Db, studioId: string, personId: string) {
  const [p] = await db.select().from(person).where(and(eq(person.studioId, studioId), eq(person.id, personId))).limit(1);
  if (!p) return null;
  const leads = await db.select({ id: lead.id }).from(lead).where(eq(lead.personId, p.id));
  const ids = leads.map((l) => l.id);
  const [[notes], [tasks]] =
    ids.length === 0
      ? [[{ n: 0 }], [{ n: 0 }]]
      : await Promise.all([
          db.select({ n: count() }).from(leadNote).where(inArray(leadNote.leadId, ids)),
          db.select({ n: count() }).from(task).where(inArray(task.leadId, ids)),
        ]);
  return { person: p, leads: ids.length, notes: notes.n, tasks: tasks.n };
}

/**
 * Permanently deletes a person and everything the CRM holds about them: their
 * leads, and with them notes, history and tasks, the web submissions they came
 * from, plus any at-risk alert, what staff noted about it, the emails sent
 * to them and what the assistant suggested about them (a lead's emails and
 * suggestions go with the lead). One
 * transaction, so it happens fully or not at all. A row in the deletion log
 * (no personal data) records that it was done.
 *
 * Not touched: an address on the email suppression list stays, so someone
 * who unsubscribed or complained is never mailed again (the address alone,
 * nothing else). The Mana mirror (members, memberships, visits), which is a copy
 * of Mana and comes back on the next sync (erasure in Mana is done in Mana),
 * and the record of which Mana events already made a win-back lead, which
 * stops the same event from making the person again.
 */
export async function deletePerson(db: Db, studioId: string, personId: string, deletedById: string) {
  const preview = await deletionPreview(db, studioId, personId);
  if (!preview) return null;
  await db.transaction(async (tx) => {
    if (preview.person.manaUserId) {
      await tx.delete(atRiskNote).where(and(eq(atRiskNote.studioId, studioId), eq(atRiskNote.manaUserId, preview.person.manaUserId)));
      await tx.delete(emailMessage).where(and(eq(emailMessage.studioId, studioId), eq(emailMessage.manaUserId, preview.person.manaUserId)));
      // What the assistant suggested about them (a lead's suggestions go with the lead).
      await tx.delete(aiSuggestion).where(and(eq(aiSuggestion.studioId, studioId), eq(aiSuggestion.manaUserId, preview.person.manaUserId)));
      await tx.delete(atRiskAlert).where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.manaUserId, preview.person.manaUserId)));
    }
    // The raw web submissions hold the same personal data, so they go too (ticket 09).
    const ids = (await tx.select({ id: lead.id }).from(lead).where(eq(lead.personId, personId))).map((l) => l.id);
    if (ids.length > 0) await tx.delete(leadSubmission).where(inArray(leadSubmission.leadId, ids));
    await tx.delete(lead).where(eq(lead.personId, personId));
    await tx.delete(person).where(and(eq(person.studioId, studioId), eq(person.id, personId)));
    await tx.insert(deletionLog).values({ studioId, deletedById, leads: preview.leads, notes: preview.notes, tasks: preview.tasks });
  });
  return { leads: preview.leads, notes: preview.notes, tasks: preview.tasks };
}

/** How long a cold lead may go without activity before it is put up for review. */
export const reviewAfterMonths = 24;

/**
 * Cold leads with no activity for 24 months, oldest first, for an owner to
 * review. Activity is anything that touches the lead (a note, a call, a stage
 * move). A person who also has a lead that is not cold, or one touched more
 * recently, is left out, since deleting them would take that lead too. This
 * only lists them; it never deletes anything.
 */
export async function staleColdLeads(db: Db, studioId: string, now: Date = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - reviewAfterMonths);
  return db
    .select({ leadId: lead.id, personId: person.id, name: person.name, lastActivity: lead.updatedAt, createdAt: lead.createdAt })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
    .where(
      and(
        eq(lead.studioId, studioId),
        eq(pipelineStage.kind, "cold"),
        lt(lead.updatedAt, cutoff),
        sql`not exists (
          select 1 from ${lead} other
          join ${pipelineStage} s on s.studio_id = other.studio_id and s.key = other.stage
          where other.person_id = ${person.id} and (s.kind <> 'cold' or other.updated_at >= ${cutoff})
        )`,
      ),
    )
    .orderBy(lead.updatedAt);
}

/** The latest deletions, for showing that erasure requests were carried out. */
export async function recentDeletions(db: Db, studioId: string, limit = 20) {
  return db.select().from(deletionLog).where(eq(deletionLog.studioId, studioId)).orderBy(desc(deletionLog.deletedAt)).limit(limit);
}
