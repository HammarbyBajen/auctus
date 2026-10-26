import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const now = new Date("2026-10-21T04:00:00Z");

describe.skipIf(!hasDb)("klippkort running out (ticket 31)", () => {
  const tag = `kk-${Date.now()}`;
  let studioA: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let sync: typeof import("@/lib/mana/sync");
  let wb: typeof import("@/lib/mana/winback-service");
  let kk: typeof import("@/lib/mana/klippkort-service");
  let leads: typeof import("@/lib/leads/service");
  let n = 0;

  const bundles = [
    { id: "klipp", name: "Klippkort", credits: 10 },
    { id: "day", name: "Tegen Day Pass", credits: 1 },
  ];
  type Held = Parameters<typeof import("@/lib/mana/sync").replaceMemberships>[3][number];
  const basic = (): Held =>
    ({
      id: `${tag}-um-${++n}`,
      membershipId: "basic",
      name: "Basic",
      type: "standard",
      status: "active",
      startDate: "2026-09-07",
      pendingChange: null,
      commitmentEndDate: null,
      cancelEffectiveDate: null,
      price: { amount: 149500, currency: "SEK" },
    }) as Held;

  async function member(id: string, items: Held[] = [], role = "member") {
    await sync.upsertMembers(db, studioA, [{ userId: id, role, profile: { name: `Namn ${id}`, email: `${id}@example.test`, phone: null } }] as never, "seed");
    await sync.replaceMemberships(db, studioA, id, items);
  }
  async function bought(user: string, bundle: string, paidAt: string) {
    await db.insert(schema.manaPurchase).values({
      studioId: studioA,
      id: `${tag}-${user}-${paidAt}`,
      manaUserId: user,
      kind: "class_credits_bundle",
      description: `Credit bundle: ${bundle}`,
      paidAt: new Date(paidAt),
    });
  }
  /** A stand-in for Mana: the bundles, and each person's pools; records who was read. */
  function mana(pools: Record<string, { credits: number; type?: string; expireDate?: string }[]>) {
    const read: string[] = [];
    return {
      read,
      getCreditBundles: async () => bundles,
      getClassCredits: async (id: string) => {
        read.push(id);
        return (pools[id] ?? []).map((p) => ({ type: "default", expireDate: "2027-10-01", ...p }));
      },
    };
  }
  const leadsOf = () =>
    db
      .select({ lead: schema.lead, person: schema.person })
      .from(schema.lead)
      .innerJoin(schema.person, eq(schema.person.id, schema.lead.personId))
      .where(eq(schema.lead.studioId, studioA));
  const tasksOf = (leadId: string) => db.select().from(schema.task).where(eq(schema.task.leadId, leadId));

  async function reset() {
    await db.delete(schema.manaSignal).where(eq(schema.manaSignal.studioId, studioA));
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioA));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioA));
    await db.delete(schema.manaMembership).where(eq(schema.manaMembership.studioId, studioA));
    await db.delete(schema.manaMember).where(eq(schema.manaMember.studioId, studioA));
    await db.delete(schema.manaPurchase).where(eq(schema.manaPurchase.studioId, studioA));
    await db.delete(schema.manaCreditBalance).where(eq(schema.manaCreditBalance.studioId, studioA));
    await db.update(schema.studioSettings).set({ manaCreditBundles: [], klippkortBundleIds: null }).where(eq(schema.studioSettings.studioId, studioA));
    await wb.setWinBackEnabled(db, studioA, true);
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    sync = await import("@/lib/mana/sync");
    wb = await import("@/lib/mana/winback-service");
    kk = await import("@/lib/mana/klippkort-service");
    leads = await import("@/lib/leads/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const [row] = await db.insert(schema.studio).values({ slug: `${tag}-a`, name: "A" }).returning();
    studioA = row.id;
    await ensureDefaultPipeline(db, studioA);
    await db.insert(schema.studioSettings).values({ studioId: studioA });
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA]));
    await pool.end();
  });

  it("saves Mana's bundles every night, but reads nobody's classes while win-back is off", async () => {
    await wb.setWinBackEnabled(db, studioA, false);
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    const source = mana({ holder: [{ credits: 2 }] });
    expect(await kk.syncKlippkort(db, source, studioA, now)).toEqual({ read: 0 });
    expect(source.read).toEqual([]);
    const [settings] = await db.select().from(schema.studioSettings).where(eq(schema.studioSettings.studioId, studioA));
    expect(settings.manaCreditBundles).toEqual(bundles);
  });

  it("reads klippkort holders without a membership: not members, staff, or day-pass buyers", async () => {
    await member("holder");
    await member("joined", [basic()]);
    await member("coach", [], "staff");
    await member("tourist");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await bought("joined", "Klippkort", "2026-09-15T10:00:00Z");
    await bought("coach", "Klippkort", "2026-09-15T10:00:00Z");
    await bought("tourist", "Tegen Day Pass", "2026-10-16T10:00:00Z");
    const source = mana({ holder: [{ credits: 5 }] });
    await kk.syncKlippkort(db, source, studioA, now);
    expect(source.read).toEqual(["holder"]);
    const [balance] = await db.select().from(schema.manaCreditBalance).where(eq(schema.manaCreditBalance.studioId, studioA));
    expect(balance).toMatchObject({ manaUserId: "holder", credits: 5, expireDate: "2027-10-01" });
  });

  it("watches what owners picked instead, once they have picked", async () => {
    await member("tourist");
    await bought("tourist", "Tegen Day Pass", "2026-10-16T10:00:00Z");
    await kk.syncKlippkort(db, mana({}), studioA, now);
    await db.update(schema.studioSettings).set({ klippkortBundleIds: ["day"] }).where(eq(schema.studioSettings.studioId, studioA));
    const source = mana({ tourist: [{ credits: 0 }] });
    await kk.syncKlippkort(db, source, studioA, now);
    expect(source.read).toEqual(["tourist"]);
  });

  it("does not read an empty card again until the person buys another", async () => {
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 0 }] }), studioA, now);
    const later = new Date(now.getTime() + 86_400_000);
    const again = mana({ holder: [{ credits: 0 }] });
    await kk.syncKlippkort(db, again, studioA, later);
    expect(again.read).toEqual([]);
    await bought("holder", "Klippkort", "2026-10-21T12:00:00Z");
    const afterNew = mana({ holder: [{ credits: 10 }] });
    await kk.syncKlippkort(db, afterNew, studioA, later);
    expect(afterNew.read).toEqual(["holder"]);
  });

  it("at 2 classes left, makes a Klippkort lead with a note and a task for today, once per card", async () => {
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 2 }] }), studioA, now);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 1, skipped: 0 });
    const [row] = await leadsOf();
    expect(row.lead).toMatchObject({ source: "mana_klippkort", stage: "from_mana" });
    const found = await leads.getLead(db, studioA, row.lead.id);
    const note = found?.history.find((h) => h.kind === "note");
    expect(note?.kind === "note" && note.body).toBe("Mana: 2 klipp kvar på Klippkort (köpt 15 sep.). Inget medlemskap.");
    expect((await tasksOf(row.lead.id)).map((t) => [t.title, t.dueDate])).toEqual([["Erbjud medlemskap: 2 klipp kvar", "2026-10-21"]]);

    // The next night, with 1 left: the same card, nothing new.
    const later = new Date(now.getTime() + 86_400_000);
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 1 }] }), studioA, later);
    expect(await wb.detectWinBacks(db, studioA, later)).toEqual({ created: 0, skipped: 0 });
    expect(await tasksOf(row.lead.id)).toHaveLength(1);
  });

  it("puts the task on a recent buyer's day-pass lead, made when they bought the card", async () => {
    await member("holder");
    await bought("holder", "Klippkort", "2026-10-01T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 8 }] }), studioA, now);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 1, skipped: 0 });
    const later = new Date("2026-10-28T04:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 2 }] }), studioA, later);
    expect(await wb.detectWinBacks(db, studioA, later)).toEqual({ created: 0, skipped: 1 });
    const [row] = await leadsOf();
    expect(row.lead.source).toBe("mana_day_pass");
    expect((await tasksOf(row.lead.id)).map((t) => [t.title, t.dueDate])).toEqual([["Erbjud medlemskap: 2 klipp kvar", "2026-10-28"]]);
  });

  it("does nothing with 3 or more left", async () => {
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 3 }] }), studioA, now);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 0 });
  });

  it("nudges about a card that expires within 14 days with classes left", async () => {
    await member("holder");
    await bought("holder", "Klippkort", "2025-11-01T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 6, expireDate: "2026-11-01" }] }), studioA, now);
    await wb.detectWinBacks(db, studioA, now);
    const [row] = await leadsOf();
    expect((await tasksOf(row.lead.id)).map((t) => t.title)).toEqual(["Erbjud medlemskap: klippkortet går ut 1 nov."]);
  });

  it("puts the task on the person's open lead instead of making a second lead", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Öppen", email: "holder@example.test", source: "contact_form" });
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 1 }] }), studioA, now);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 1 });
    expect(await leadsOf()).toHaveLength(1);
    expect((await tasksOf(lead.id)).map((t) => t.title)).toEqual(["Erbjud medlemskap: 1 klipp kvar"]);
  });

  it("makes a new lead even when the person was dismissed lately: they still train and pay", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Avfärdad", email: "holder@example.test", source: "contact_form" });
    await leads.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "price" });
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 0 }] }), studioA, now);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 1, skipped: 0 });
    const rows = await leadsOf();
    const fresh = rows.find((r) => r.lead.id !== lead.id)!;
    expect((await tasksOf(fresh.lead.id)).map((t) => t.title)).toEqual(["Erbjud medlemskap: klippkortet är slut"]);
  });

  it("does not act on a balance from before the card was bought", async () => {
    await member("holder");
    await bought("holder", "Klippkort", "2026-09-15T10:00:00Z");
    await kk.syncKlippkort(db, mana({ holder: [{ credits: 1 }] }), studioA, new Date("2026-10-20T04:00:00Z"));
    await bought("holder", "Klippkort", "2026-10-20T12:00:00Z");
    expect(await kk.klippkortSignals(db, studioA, now)).toEqual([]);
  });

  it("keeps klippkort purchases for their lifetime, and drop-ins only 60 days", async () => {
    await db.insert(schema.manaPurchase).values([
      { studioId: studioA, id: `${tag}-old-card`, manaUserId: "x", kind: "class_credits_bundle", description: "Credit bundle: Klippkort", paidAt: new Date("2026-03-01T10:00:00Z") },
      { studioId: studioA, id: `${tag}-old-class`, manaUserId: "x", kind: "single_class", description: "Class: CrossFit", paidAt: new Date("2026-08-01T10:00:00Z") },
      { studioId: studioA, id: `${tag}-ancient-card`, manaUserId: "x", kind: "class_credits_bundle", description: "Credit bundle: Klippkort", paidAt: new Date("2025-08-01T10:00:00Z") },
    ]);
    await wb.syncPurchases(db, { getPaidPayments: async () => [], getPayments: async () => [] }, studioA, now);
    const rows = await db.select().from(schema.manaPurchase).where(and(eq(schema.manaPurchase.studioId, studioA)));
    expect(rows.map((r) => r.id)).toEqual([`${tag}-old-card`]);
  });
});
