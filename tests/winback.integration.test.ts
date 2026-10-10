import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const now = new Date("2026-10-09T10:00:00Z");

describe.skipIf(!hasDb)("win-back leads from Mana", () => {
  const tag = `wb-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let sync: typeof import("@/lib/mana/sync");
  let wb: typeof import("@/lib/mana/winback-service");
  let leads: typeof import("@/lib/leads/service");
  let n = 0;

  type Held = Parameters<typeof import("@/lib/mana/sync").replaceMemberships>[3][number];
  function held(overrides: Partial<Held>): Held {
    n += 1;
    return {
      id: `${tag}-um-${n}`,
      membershipId: "basic",
      name: "Basic",
      type: "standard",
      status: "active",
      startDate: "2026-09-07",
      pendingChange: null,
      commitmentEndDate: null,
      cancelEffectiveDate: "2026-11-30",
      price: { amount: 149500, currency: "SEK" },
      ...overrides,
    } as Held;
  }
  async function member(studioId: string, id: string, items: Held[], email = `${id}@example.test`, role = "member") {
    await sync.upsertMembers(db, studioId, [{ userId: id, role, profile: { name: `Namn ${id}`, email, phone: null } }] as never, "seed");
    await sync.replaceMemberships(db, studioId, id, items);
  }
  const leadsOf = (studioId: string) =>
    db
      .select({ lead: schema.lead, person: schema.person })
      .from(schema.lead)
      .innerJoin(schema.person, eq(schema.person.id, schema.lead.personId))
      .where(eq(schema.lead.studioId, studioId));

  async function reset() {
    for (const id of [studioA, studioB]) {
      await db.delete(schema.manaSignal).where(eq(schema.manaSignal.studioId, id));
      await db.delete(schema.lead).where(eq(schema.lead.studioId, id));
      await db.delete(schema.person).where(eq(schema.person.studioId, id));
      await db.delete(schema.manaMembership).where(eq(schema.manaMembership.studioId, id));
      await db.delete(schema.manaMember).where(eq(schema.manaMember.studioId, id));
      await db.delete(schema.manaPurchase).where(eq(schema.manaPurchase.studioId, id));
      await wb.setWinBackEnabled(db, id, true);
    }
  }

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    sync = await import("@/lib/mana/sync");
    wb = await import("@/lib/mana/winback-service");
    leads = await import("@/lib/leads/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const rows = await db.insert(schema.studio).values([{ slug: `${tag}-a`, name: "A" }, { slug: `${tag}-b`, name: "B" }]).returning();
    studioA = rows[0].id;
    studioB = rows[1].id;
    for (const id of [studioA, studioB]) {
      await ensureDefaultPipeline(db, id);
      await db.insert(schema.studioSettings).values({ studioId: id });
    }
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("does nothing until an owner switches it on", async () => {
    await wb.setWinBackEnabled(db, studioA, false);
    await member(studioA, "off", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })]);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 0 });
    expect(await leadsOf(studioA)).toHaveLength(0);
  });

  it("makes a lead for a cancellation, in the first stage, with its own source and what happened", async () => {
    await member(studioA, "leaver", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(1);
    const [row] = await leadsOf(studioA);
    expect(row.lead).toMatchObject({ source: "mana_cancelled", stage: "new_lead" });
    expect(row.person).toMatchObject({ manaUserId: "leaver", email: "leaver@example.test", name: "Namn leaver" });
    const found = await leads.getLead(db, studioA, row.lead.id);
    const note = found?.history.find((h) => h.kind === "note");
    expect(note?.kind === "note" && note.body).toContain("Basic");
    expect(note?.kind === "note" && note.body).toContain("30 nov");
  });

  it("handles a signal once: no second lead on the next run, not even after the first is closed", async () => {
    await member(studioA, "once", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })]);
    await wb.detectWinBacks(db, studioA, now);
    const [row] = await leadsOf(studioA);
    await leads.moveLeadStage(db, studioA, row.lead.id, "won");
    await wb.detectWinBacks(db, studioA, now);
    await wb.detectWinBacks(db, studioA, now);
    expect(await leadsOf(studioA)).toHaveLength(1);
  });

  it("does not treat a switch between plans as leaving", async () => {
    await member(studioA, "switch", [
      held({ pendingChange: { kind: "cancel", endDate: "2026-10-31" } }),
      held({ status: "future", startDate: "2026-11-01", name: "Basic (12mån)" }),
    ]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
  });

  it("makes a lead for a freeze and for a recently ended membership, but not an old one", async () => {
    await member(studioA, "freezer", [held({ pendingChange: { kind: "freeze", freezeDate: "2026-10-20" } })]);
    await member(studioA, "ended", [held({ status: "ended", pendingChange: { kind: "cancel", endDate: "2026-09-30" }, cancelEffectiveDate: null })]);
    await member(studioA, "longgone", [held({ status: "ended", pendingChange: { kind: "cancel", endDate: "2026-07-31" }, cancelEffectiveDate: null })]);
    await wb.detectWinBacks(db, studioA, now);
    const sources = (await leadsOf(studioA)).map((r) => [r.person.manaUserId, r.lead.source]).sort();
    expect(sources).toEqual([
      ["ended", "mana_ended"],
      ["freezer", "mana_freeze"],
    ]);
  });

  it("makes a lead for a recent day pass buyer with no membership, but not for a member", async () => {
    await member(studioA, "tourist", []);
    await member(studioA, "regular", [held({})]);
    await db.insert(schema.manaPurchase).values([
      { studioId: studioA, id: `${tag}-p1`, manaUserId: "tourist", kind: "class_credits_bundle", description: "Credit bundle: Tegen Day Pass", paidAt: new Date("2026-10-05T10:00:00Z") },
      { studioId: studioA, id: `${tag}-p2`, manaUserId: "regular", kind: "single_class", description: "Class: CrossFit", paidAt: new Date("2026-10-06T10:00:00Z") },
    ]);
    await wb.detectWinBacks(db, studioA, now);
    const rows = await leadsOf(studioA);
    expect(rows.map((r) => [r.person.manaUserId, r.lead.source])).toEqual([["tourist", "mana_day_pass"]]);
  });

  it("never makes a lead for staff or owners, whatever their memberships or purchases show", async () => {
    await member(studioA, "coach", [held({ name: "Fri träning", price: { amount: 0, currency: "SEK" }, pendingChange: { kind: "cancel", endDate: "2026-11-30" } })], "coach@example.test", "staff");
    await member(studioA, "boss", [], "boss@example.test", "owner");
    await db.insert(schema.manaPurchase).values([
      { studioId: studioA, id: `${tag}-p-boss`, manaUserId: "boss", kind: "single_class", description: "Class: CrossFit", paidAt: new Date("2026-10-06T10:00:00Z") },
    ]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
    expect(await leadsOf(studioA)).toHaveLength(0);
  });

  it("adds a note to a person's open lead instead of making a second lead", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Öppen", email: "open@example.test", source: "contact_form" });
    await member(studioA, "openperson", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })], "open@example.test");
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 1 });
    const rows = await leadsOf(studioA);
    expect(rows).toHaveLength(1);
    const found = await leads.getLead(db, studioA, lead.id);
    expect(found?.history.some((h) => h.kind === "note" && h.body.includes("uppsagt"))).toBe(true);
  });

  it("leaves alone a person dismissed in the last 90 days", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Avfärdad", email: "gone@example.test", source: "contact_form" });
    await leads.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "price" });
    await member(studioA, "dismissed", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })], "gone@example.test");
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 1 });
    expect(await leadsOf(studioA)).toHaveLength(1);
  });

  it("gives a member whose old lead was won a new win-back lead on the same person", async () => {
    const { lead, person } = await leads.createOrMatchLead(db, studioA, { name: "Vunnen", email: "won@example.test", source: "contact_form" });
    await leads.moveLeadStage(db, studioA, lead.id, "won");
    await member(studioA, "wonbefore", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })], "won@example.test");
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(1);
    const rows = await leadsOf(studioA);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.person.id))).toEqual(new Set([person.id]));
  });

  it("records the reason on a win-back lead, and refuses other leads and unknown reasons", async () => {
    await member(studioA, "why", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })]);
    await wb.detectWinBacks(db, studioA, now);
    const [row] = await leadsOf(studioA);
    expect((await wb.setWinBackReason(db, studioA, row.lead.id, "injury")).winBackReason).toBe("injury");
    await expect(wb.setWinBackReason(db, studioA, row.lead.id, "made-up")).rejects.toMatchObject({ code: "unknown_reason" });
    const { lead: ordinary } = await leads.createOrMatchLead(db, studioA, { name: "Vanlig", email: "plain@example.test", source: "manual" });
    await expect(wb.setWinBackReason(db, studioA, ordinary.id, "injury")).rejects.toMatchObject({ code: "not_win_back" });
    await expect(wb.setWinBackReason(db, studioB, row.lead.id, "injury")).rejects.toMatchObject({ code: "not_found" });
  });

  it("does not ask a day-pass buyer why they left, since they are a new prospect", async () => {
    await member(studioA, "prospect", []);
    await db.insert(schema.manaPurchase).values({
      studioId: studioA, id: `${tag}-dp`, manaUserId: "prospect", kind: "single_class", description: "Class", paidAt: new Date("2026-10-07T10:00:00Z"),
    });
    await wb.detectWinBacks(db, studioA, now);
    const [row] = await leadsOf(studioA);
    expect(row.lead.source).toBe("mana_day_pass");
    await expect(wb.setWinBackReason(db, studioA, row.lead.id, "injury")).rejects.toMatchObject({ code: "not_win_back" });
  });

  it("still makes a lead when someone cancels the gym but keeps an add-on such as a locker", async () => {
    await member(studioA, "lockerkeeper", [
      held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } }),
      held({ membershipId: "locker", name: "Förvaringsbox", price: { amount: 5000, currency: "SEK" } }),
    ]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
    await db.delete(schema.manaSignal).where(eq(schema.manaSignal.studioId, studioA));
    await wb.setAddOnMemberships(db, studioA, ["locker"]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(1);
    await wb.setAddOnMemberships(db, studioA, []);
  });

  it("keeps studios apart", async () => {
    await member(studioB, "elsewhere", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })]);
    await wb.detectWinBacks(db, studioA, now);
    expect(await leadsOf(studioA)).toHaveLength(0);
    await wb.detectWinBacks(db, studioB, now);
    expect(await leadsOf(studioB)).toHaveLength(1);
  });

  it("stores only paid day pass, clip card and drop-in purchases, and forgets old ones", async () => {
    await db.insert(schema.manaPurchase).values({
      studioId: studioA, id: `${tag}-old`, manaUserId: "x", kind: "single_class", description: null, paidAt: new Date("2026-07-01T10:00:00Z"),
    });
    const stored = await wb.syncPurchases(
      db,
      {
        getPaidPayments: async () => [
          { id: `${tag}-a`, user: { id: "u1" }, paidAt: "2026-10-01T10:00:00Z", kind: "class_credits_bundle", description: "Day Pass" },
          { id: `${tag}-b`, user: { id: "u2" }, paidAt: "2026-10-02T10:00:00Z", kind: "membership", description: "Membership: Basic" },
          { id: `${tag}-c`, user: { id: "u3" }, paidAt: "2026-10-03T10:00:00Z", kind: "course", description: "Kids" },
          { id: `${tag}-d`, user: null, paidAt: "2026-10-03T10:00:00Z", kind: "single_class", description: "Class" },
        ],
      },
      studioA,
      now,
    );
    expect(stored).toBe(1);
    const rows = await db.select().from(schema.manaPurchase).where(and(eq(schema.manaPurchase.studioId, studioA)));
    expect(rows.map((r) => r.id)).toEqual([`${tag}-a`]);
  });
});
