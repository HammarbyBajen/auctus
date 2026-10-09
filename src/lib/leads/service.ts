import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { lead, leadNote, person, user } from "@/db/schema";
import { t } from "@/lib/i18n";
import { initialStage, type LeadSource } from "./constants";
import { normalizeEmail, normalizePhone } from "./matching";

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
 * - a known person without a lead: a new lead is created for them,
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
        .select()
        .from(lead)
        .where(eq(lead.personId, existing.id))
        .orderBy(desc(lead.createdAt))
        .limit(1);
      if (latest) {
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

/** All leads of a studio with their person, newest first. */
export async function listLeads(db: Db, studioId: string) {
  return db
    .select({ lead, person })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .where(eq(lead.studioId, studioId))
    .orderBy(desc(lead.createdAt));
}

/** One lead with its person and notes (newest first), or null when it does not belong to the studio. */
export async function getLead(db: Db, studioId: string, leadId: string) {
  const [found] = await db
    .select({ lead, person })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!found) return null;
  const notes = await db
    .select({
      id: leadNote.id,
      body: leadNote.body,
      createdAt: leadNote.createdAt,
      authorName: user.name,
    })
    .from(leadNote)
    .leftJoin(user, eq(user.id, leadNote.authorId))
    .where(and(eq(leadNote.studioId, studioId), eq(leadNote.leadId, leadId)))
    .orderBy(desc(leadNote.createdAt));
  return { lead: found.lead, person: found.person, notes };
}

export async function addNote(
  db: Db,
  studioId: string,
  leadId: string,
  body: string,
  authorId: string | null,
) {
  const found = await getLead(db, studioId, leadId);
  if (!found) return null;
  const [note] = await db
    .insert(leadNote)
    .values({ studioId, leadId, body: body.trim(), authorId })
    .returning();
  await db.update(lead).set({ updatedAt: new Date() }).where(eq(lead.id, leadId));
  return note;
}
