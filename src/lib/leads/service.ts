import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { lead, leadNote, user } from "@/db/schema";
import { t } from "@/lib/i18n";
import { isLeadSource, initialStage, type LeadSource } from "./constants";
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
 * Creates a lead, or, when the same person is already a lead (same email, then
 * same phone), adds a note to the existing lead and fills in missing contact
 * details instead of making a second one.
 */
export async function createOrMatchLead(db: Db, studioId: string, input: NewLeadInput) {
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const emailNormalized = normalizeEmail(email);
  const phoneNormalized = normalizePhone(phone);

  return db.transaction(async (tx) => {
    let existing: typeof lead.$inferSelect | undefined;
    if (emailNormalized) {
      [existing] = await tx
        .select()
        .from(lead)
        .where(and(eq(lead.studioId, studioId), eq(lead.emailNormalized, emailNormalized)))
        .limit(1);
    }
    if (!existing && phoneNormalized) {
      [existing] = await tx
        .select()
        .from(lead)
        .where(and(eq(lead.studioId, studioId), eq(lead.phoneNormalized, phoneNormalized)))
        .limit(1);
    }

    if (existing) {
      const details = [input.name, email, phone].filter(Boolean).join(", ");
      await tx.insert(leadNote).values({
        studioId,
        leadId: existing.id,
        body: t("lead.duplicateNote", { details }),
        authorId: input.createdById ?? null,
      });
      const [updated] = await tx
        .update(lead)
        .set({
          email: existing.email ?? email,
          emailNormalized: existing.emailNormalized ?? emailNormalized,
          phone: existing.phone ?? phone,
          phoneNormalized: existing.phoneNormalized ?? phoneNormalized,
          updatedAt: new Date(),
        })
        .where(eq(lead.id, existing.id))
        .returning();
      return { lead: updated, duplicate: true };
    }

    const [created] = await tx
      .insert(lead)
      .values({
        studioId,
        name: input.name.trim(),
        email,
        emailNormalized,
        phone,
        phoneNormalized,
        source: input.source,
        stage: initialStage,
        createdById: input.createdById ?? null,
      })
      .returning();
    return { lead: created, duplicate: false };
  });
}

/** All leads of a studio, newest first. */
export async function listLeads(db: Db, studioId: string) {
  return db.select().from(lead).where(eq(lead.studioId, studioId)).orderBy(desc(lead.createdAt));
}

/** One lead with its notes (newest first), or null when it does not belong to the studio. */
export async function getLead(db: Db, studioId: string, leadId: string) {
  const [found] = await db
    .select()
    .from(lead)
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
  return { lead: found, notes };
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

export { isLeadSource };
