import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("privacy tools", () => {
  const tag = `privacy-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let privacy: typeof import("@/lib/privacy/service");
  let leads: typeof import("@/lib/leads/service");
  let tasks: typeof import("@/lib/tasks/service");
  const now = new Date("2028-06-01T10:00:00Z");
  const monthsAgo = (m: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - m);
    return d;
  };

  async function newLead(name: string, opts: { stage?: string; touched?: Date } = {}) {
    const email = `${name.toLowerCase().replace(/\s/g, "")}-${tag}@example.test`;
    const { lead, person } = await leads.createOrMatchLead(db, studioId, { name, email, source: "contact_form" });
    if (opts.stage) await leads.moveLeadStage(db, studioId, lead.id, opts.stage, opts.stage === "cold" ? { coldReason: "other" } : {});
    if (opts.touched) await db.update(schema.lead).set({ updatedAt: opts.touched }).where(eq(schema.lead.id, lead.id));
    return { lead, person };
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    privacy = await import("@/lib/privacy/service");
    leads = await import("@/lib/leads/service");
    tasks = await import("@/lib/tasks/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Privacy" }).returning();
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    await ensureDefaultPipeline(db, studioId);
    [{ id: ownerId }] = await db
      .insert(schema.user)
      .values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId })
      .returning();
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("deletes a web submission that lost its lead, found by the person's email", async () => {
    const { lead, person } = await newLead("Cia Form");
    // The raw submission, as the website sent it, whose lead was later removed (a replaced import).
    await db.insert(schema.leadSubmission).values({
      studioId, senderId: `${tag}-orphan`, route: "contact", isTest: false, outcome: "created", leadId: null,
      payload: { name: "Cia Form", email: person.email!.toUpperCase(), phone: null, message: "Hej" },
    });
    await db.insert(schema.leadSubmission).values({
      studioId, senderId: `${tag}-other`, route: "contact", isTest: false, outcome: "created", leadId: null,
      payload: { name: "Någon annan", email: `other-${tag}@example.test`, phone: null, message: "Hej" },
    });
    expect(lead.id).toBeTruthy();
    await privacy.deletePerson(db, studioId, person.id, ownerId);
    const left = await db.select({ senderId: schema.leadSubmission.senderId }).from(schema.leadSubmission).where(eq(schema.leadSubmission.studioId, studioId));
    expect(left.map((s) => s.senderId)).toEqual([`${tag}-other`]);
    await db.delete(schema.leadSubmission).where(eq(schema.leadSubmission.studioId, studioId));
  });

  it("deletes a person with every lead, note, history entry, task and at-risk alert, logs it, and leaves others alone", async () => {
    const { lead, person } = await newLead("Anna Radera");
    await db.update(schema.person).set({ manaUserId: `${tag}-mana` }).where(eq(schema.person.id, person.id));
    await leads.addNote(db, studioId, lead.id, "Ring tillbaka", ownerId);
    await leads.logContact(db, studioId, lead.id, "called", ownerId);
    await tasks.createTask(db, studioId, lead.id, { title: "Boka", dueDate: "2028-06-05" }, ownerId);
    await db.insert(schema.atRiskAlert).values({ studioId, manaUserId: `${tag}-mana` });
    await db.insert(schema.manaSignal).values({ studioId, kind: "cancelled", manaRef: `${tag}-ref`, manaUserId: `${tag}-mana`, leadId: lead.id });
    const other = await newLead("Bo Kvar");

    expect(await privacy.deletionPreview(db, studioId, person.id)).toMatchObject({ leads: 1, notes: 1, tasks: 1 });
    expect(await privacy.deletePerson(db, studioId, person.id, ownerId)).toEqual({ leads: 1, notes: 1, tasks: 1 });

    expect(await db.select().from(schema.person).where(eq(schema.person.id, person.id))).toEqual([]);
    expect(await db.select().from(schema.lead).where(eq(schema.lead.id, lead.id))).toEqual([]);
    expect(await db.select().from(schema.leadNote).where(eq(schema.leadNote.leadId, lead.id))).toEqual([]);
    expect(await db.select().from(schema.leadEvent).where(eq(schema.leadEvent.leadId, lead.id))).toEqual([]);
    expect(await db.select().from(schema.task).where(eq(schema.task.leadId, lead.id))).toEqual([]);
    expect(await db.select().from(schema.atRiskAlert).where(eq(schema.atRiskAlert.studioId, studioId))).toEqual([]);
    // The Mana event stays known, without the link, so it cannot make the person again.
    const [signal] = await db.select().from(schema.manaSignal).where(eq(schema.manaSignal.manaRef, `${tag}-ref`));
    expect(signal.leadId).toBeNull();
    const [log] = await privacy.recentDeletions(db, studioId);
    expect(log).toMatchObject({ deletedById: ownerId, leads: 1, notes: 1, tasks: 1 });
    expect(Object.values(log).join(" ")).not.toContain("Anna");

    expect(await db.select().from(schema.lead).where(eq(schema.lead.id, other.lead.id))).toHaveLength(1);
    await db.delete(schema.manaSignal).where(eq(schema.manaSignal.studioId, studioId));
  });

  it("does nothing for an unknown person or another studio's person", async () => {
    expect(await privacy.deletePerson(db, studioId, "00000000-0000-0000-0000-000000000000", ownerId)).toBeNull();
  });

  it("lists cold leads untouched for 24 months, unless the person has a newer or open lead", async () => {
    const old = await newLead("Gammal Kall", { stage: "cold", touched: monthsAgo(25) });
    await newLead("Nyare Kall", { stage: "cold", touched: monthsAgo(23) });
    await newLead("Gammal Öppen", { touched: monthsAgo(30) });
    const mixed = await newLead("Blandad Person", { stage: "cold", touched: monthsAgo(26) });
    // The same person came back as a new lead (a second lead on the same person).
    await db.insert(schema.lead).values({ studioId, personId: mixed.person.id, source: "manual", stage: "new_lead" });

    const list = await privacy.staleColdLeads(db, studioId, now);
    expect(list.map((r) => r.name)).toEqual(["Gammal Kall"]);
    expect(list[0]).toMatchObject({ leadId: old.lead.id, personId: old.person.id });
    await db.delete(schema.lead).where(inArray(schema.lead.personId, [mixed.person.id]));
  });
});
