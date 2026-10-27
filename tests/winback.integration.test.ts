import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const now = new Date("2026-10-09T10:00:00Z");

describe.skipIf(!hasDb)("Medlemmar from Mana: ended memberships and day passes (ticket 12, moved 2026-10-27)", () => {
  const tag = `wb-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let sync: typeof import("@/lib/mana/sync");
  let wb: typeof import("@/lib/mana/winback-service");
  let leads: typeof import("@/lib/leads/service");
  let atRisk: typeof import("@/lib/mana/at-risk-service");
  const userId = `${tag}-u`;
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
  /** A membership that ended within the last 30 days. */
  const ended = (overrides: Partial<Held> = {}) => held({ status: "ended", pendingChange: { kind: "cancel", endDate: "2026-09-30" }, cancelEffectiveDate: null, ...overrides });

  async function member(studioId: string, id: string, items: Held[], email = `${id}@example.test`, role = "member") {
    await sync.upsertMembers(db, studioId, [{ userId: id, role, profile: { name: `Namn ${id}`, email, phone: null } }] as never, "seed");
    await sync.replaceMemberships(db, studioId, id, items);
  }
  const rowsOf = (studioId: string) => db.select().from(schema.atRiskAlert).where(eq(schema.atRiskAlert.studioId, studioId)).orderBy(schema.atRiskAlert.manaUserId);
  const leadsOf = (studioId: string) => db.select().from(schema.lead).where(eq(schema.lead.studioId, studioId));

  async function reset() {
    for (const id of [studioA, studioB]) {
      await db.delete(schema.manaSignal).where(eq(schema.manaSignal.studioId, id));
      await db.delete(schema.atRiskNote).where(eq(schema.atRiskNote.studioId, id));
      await db.delete(schema.atRiskAlert).where(eq(schema.atRiskAlert.studioId, id));
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
    atRisk = await import("@/lib/mana/at-risk-service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const rows = await db.insert(schema.studio).values([{ slug: `${tag}-a`, name: "A" }, { slug: `${tag}-b`, name: "B" }]).returning();
    studioA = rows[0].id;
    studioB = rows[1].id;
    for (const id of [studioA, studioB]) {
      await ensureDefaultPipeline(db, id);
      await db.insert(schema.studioSettings).values({ studioId: id });
    }
    await db.insert(schema.user).values({ id: userId, name: "Personal", email: `${userId}@example.test`, emailVerified: true, role: "owner", studioId: studioA });
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("does nothing until an owner switches it on", async () => {
    await wb.setWinBackEnabled(db, studioA, false);
    await member(studioA, "off", [ended()]);
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 0, resolved: 0 });
    expect(await rowsOf(studioA)).toHaveLength(0);
  });

  it("puts a recently ended membership under Medlemmar → Har slutat, with what Mana shows; no lead, no person", async () => {
    await member(studioA, "leaver", [ended()]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(1);
    const [row] = await rowsOf(studioA);
    expect(row).toMatchObject({ manaUserId: "leaver", cause: "ended", changeDate: "2026-09-30", status: "open" });
    const [listed] = await atRisk.listAtRisk(db, studioA, now);
    expect(listed).toMatchObject({ group: "ended", cause: "ended" });
    expect(listed.notes[0]).toMatchObject({ kind: "mana", by: null });
    expect(listed.notes[0].body).toContain("Basic");
    expect(listed.notes[0].body).toContain("30 sep");
    expect(await leadsOf(studioA)).toHaveLength(0);
    expect(await db.select().from(schema.person).where(eq(schema.person.studioId, studioA))).toHaveLength(0);
  });

  it("makes no row here for a notice or a freeze: detectLeaving keeps those", async () => {
    await member(studioA, "notice", [held({ pendingChange: { kind: "cancel", endDate: "2026-11-30" } })]);
    await member(studioA, "freezer", [held({ pendingChange: { kind: "freeze", freezeDate: "2026-10-20" } })]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
    expect(await rowsOf(studioA)).toHaveLength(0);
  });

  it("handles a signal once: no second row on the next run, not even after the first is handled", async () => {
    await member(studioA, "once", [ended()]);
    await wb.detectWinBacks(db, studioA, now);
    const [row] = await rowsOf(studioA);
    await atRisk.dismissAlert(db, studioA, row.id, userId, { reason: "price", returnBy: null, body: "" }, now);
    await wb.detectWinBacks(db, studioA, now);
    await wb.detectWinBacks(db, studioA, now);
    expect(await rowsOf(studioA)).toHaveLength(1);
  });

  it("closes the row by itself when they hold a membership again", async () => {
    await member(studioA, "back", [ended()]);
    await wb.detectWinBacks(db, studioA, now);
    await sync.replaceMemberships(db, studioA, "back", [ended(), held({ startDate: "2026-10-08" })]);
    expect((await wb.detectWinBacks(db, studioA, now)).resolved).toBe(1);
    expect((await rowsOf(studioA))[0].status).toBe("resolved");
  });

  it("does not treat a switch between plans as leaving", async () => {
    await member(studioA, "switch", [
      held({ pendingChange: { kind: "cancel", endDate: "2026-10-31" } }),
      held({ status: "future", startDate: "2026-11-01", name: "Basic (12mån)" }),
    ]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
  });

  it("puts a recently ended membership on the list, but not an old one", async () => {
    await member(studioA, "ended", [ended()]);
    await member(studioA, "longgone", [ended({ pendingChange: { kind: "cancel", endDate: "2026-07-31" } })]);
    await wb.detectWinBacks(db, studioA, now);
    expect((await rowsOf(studioA)).map((r) => [r.manaUserId, r.cause])).toEqual([["ended", "ended"]]);
  });

  it("puts a recent day pass buyer with no membership under Dagpass, but not a member", async () => {
    await member(studioA, "tourist", []);
    await member(studioA, "regular", [held({})]);
    await db.insert(schema.manaPurchase).values([
      { studioId: studioA, id: `${tag}-p1`, manaUserId: "tourist", kind: "class_credits_bundle", description: "Credit bundle: Tegen Day Pass", paidAt: new Date("2026-10-05T10:00:00Z") },
      { studioId: studioA, id: `${tag}-p2`, manaUserId: "regular", kind: "single_class", description: "Class: CrossFit", paidAt: new Date("2026-10-06T10:00:00Z") },
    ]);
    await wb.detectWinBacks(db, studioA, now);
    expect((await rowsOf(studioA)).map((r) => [r.manaUserId, r.cause, r.changeDate])).toEqual([["tourist", "day_pass", "2026-10-05"]]);
  });

  it("never puts staff or owners on the list, whatever their memberships or purchases show", async () => {
    await member(studioA, "coach", [held({ name: "Fri träning", price: { amount: 0, currency: "SEK" }, status: "ended", pendingChange: { kind: "cancel", endDate: "2026-09-30" } })], "coach@example.test", "staff");
    await member(studioA, "boss", [], "boss@example.test", "owner");
    await db.insert(schema.manaPurchase).values([
      { studioId: studioA, id: `${tag}-p-boss`, manaUserId: "boss", kind: "single_class", description: "Class: CrossFit", paidAt: new Date("2026-10-06T10:00:00Z") },
    ]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
    expect(await rowsOf(studioA)).toHaveLength(0);
  });

  it("adds a note to a person's open lead instead of a row, so someone being sold to stays in Leads", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Öppen", email: "open@example.test", source: "contact_form" });
    await member(studioA, "openperson", [ended()], "open@example.test");
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 1, resolved: 0 });
    expect(await rowsOf(studioA)).toHaveLength(0);
    const found = await leads.getLead(db, studioA, lead.id);
    expect(found?.history.some((h) => h.kind === "note" && h.body.startsWith("Mana: ") && h.body.includes("avslutades"))).toBe(true);
  });

  it("leaves alone a person dismissed as a lead in the last 90 days", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Avfärdad", email: "gone@example.test", source: "contact_form" });
    await leads.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "price" });
    await member(studioA, "dismissed", [ended()], "gone@example.test");
    expect(await wb.detectWinBacks(db, studioA, now)).toEqual({ created: 0, skipped: 1, resolved: 0 });
    expect(await rowsOf(studioA)).toHaveLength(0);
  });

  it("puts a member whose old lead was won on the list like anyone else", async () => {
    const { lead } = await leads.createOrMatchLead(db, studioA, { name: "Vunnen", email: "won@example.test", source: "contact_form" });
    await leads.moveLeadStage(db, studioA, lead.id, "won");
    await member(studioA, "wonbefore", [ended()], "won@example.test");
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(1);
    expect(await leadsOf(studioA)).toHaveLength(1);
  });

  it("still puts someone on the list who leaves the gym but keeps an add-on such as a locker", async () => {
    await member(studioA, "lockerkeeper", [
      ended(),
      held({ membershipId: "locker", name: "Förvaringsbox", price: { amount: 5000, currency: "SEK" } }),
    ]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(0);
    await db.delete(schema.manaSignal).where(eq(schema.manaSignal.studioId, studioA));
    await wb.setAddOnMemberships(db, studioA, ["locker"]);
    expect((await wb.detectWinBacks(db, studioA, now)).created).toBe(1);
    await wb.setAddOnMemberships(db, studioA, []);
  });

  it("keeps studios apart", async () => {
    await member(studioB, "elsewhere", [ended()]);
    await wb.detectWinBacks(db, studioA, now);
    expect(await rowsOf(studioA)).toHaveLength(0);
    await wb.detectWinBacks(db, studioB, now);
    expect(await rowsOf(studioB)).toHaveLength(1);
  });

  it("stores only paid day pass, clip card and drop-in purchases, and forgets old ones", async () => {
    await db.insert(schema.manaPurchase).values({
      studioId: studioA, id: `${tag}-old`, manaUserId: "x", kind: "single_class", description: null, paidAt: new Date("2026-07-01T10:00:00Z"),
    });
    const paid = (id: string, user: string | null, kind: string, description: string) => ({
      id: `${tag}-${id}`, user: user ? { id: user } : null, paidAt: "2026-10-02T10:00:00Z", status: "paid", kind, description,
    });
    const asked: string[] = [];
    const source = {
      getPaidPayments: async (fromAt: string) => {
        asked.push(`paid ${fromAt.slice(0, 10)}`);
        return [paid("a", "u1", "class_credits_bundle", "Day Pass"), paid("b", "u2", "membership", "Membership: Basic"), paid("c", "u3", "course", "Kids"), paid("d", null, "single_class", "Class")];
      },
      getPayments: async () => [],
    };
    // A full night: the paid payments of the last 35 days; no signals needed.
    const stored = await wb.syncPurchases(db, source, studioA, now);
    expect([stored.saved, stored.payers]).toEqual([1, []]);
    expect(asked).toEqual([`paid ${new Date(now.getTime() - 35 * 86_400_000).toISOString().slice(0, 10)}`]);
    const rows = await db.select().from(schema.manaPurchase).where(and(eq(schema.manaPurchase.studioId, studioA)));
    expect(rows.map((r) => r.id)).toEqual([`${tag}-a`]);
  });

  it("on a partial night, reads payments in any state since the last run and names everyone in them (ticket 28)", async () => {
    let from = "";
    const source = {
      getPaidPayments: async () => {
        throw new Error("a partial night reads every state since the last run instead");
      },
      getPayments: async (fromAt: string) => {
        from = fromAt;
        return [
          // A new membership whose first payment is not paid yet: a signal all the same.
          { id: `${tag}-p1`, user: { id: "u5" }, paidAt: null, status: "pending", kind: "membership", description: "Membership: Basic" },
          { id: `${tag}-p2`, user: { id: "u6" }, paidAt: null, status: "draft", kind: "membership", description: "Membership: Basic" },
          { id: `${tag}-p3`, user: { id: "u7" }, paidAt: "2026-10-12T09:00:00Z", status: "paid", kind: "single_class", description: "Drop-in" },
        ];
      },
    };
    const since = new Date("2026-10-12T03:00:00Z");
    const stored = await wb.syncPurchases(db, source, studioA, now, since);
    expect(stored.payers.sort()).toEqual(["u5", "u6", "u7"]);
    // Only the paid drop-in is a purchase; two days of margin before the last run.
    expect(stored.saved).toBe(1);
    expect(from).toBe("2026-10-10T03:00:00.000Z");
  });
});
