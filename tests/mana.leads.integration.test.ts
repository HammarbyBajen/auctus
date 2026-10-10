import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/mana/${name}.json`, "utf8"));

describe.skipIf(!hasDb)("Mana membership on leads and automatic Won", () => {
  const tag = `mlead-${Date.now()}`;
  let studioA: string;
  let studioB: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let leads: typeof import("@/lib/leads/service");
  let manaLeads: typeof import("@/lib/mana/leads");
  let sync: typeof import("@/lib/mana/sync");
  let counter = 0;

  type Held = ReturnType<typeof fixture>["data"]["items"][number];
  const held = (overrides: Partial<Held>): Held => ({ ...fixture("user-memberships-b").data.items[0], ...overrides });
  const personRow = (id: string, email: string | null, phone: string | null, role = "member") => ({
    userId: id,
    role,
    profile: { name: `Mana ${id}`, email, phone },
  });

  async function seedMana(studioId: string, people: ReturnType<typeof personRow>[], memberships: Record<string, Held[]>) {
    await sync.upsertMembers(db, studioId, people as never, "seed");
    for (const [id, items] of Object.entries(memberships)) await sync.replaceMemberships(db, studioId, id, items as never);
  }

  async function newLead(studioId: string, contact: { email?: string; phone?: string }, createdAt?: Date) {
    counter += 1;
    const { lead, person } = await leads.createOrMatchLead(db, studioId, {
      name: `Lead ${counter}`,
      ...contact,
      source: "contact_form",
    });
    if (createdAt) await db.update(schema.lead).set({ createdAt }).where(eq(schema.lead.id, lead.id));
    return { lead, person };
  }

  const stageOf = async (leadId: string) =>
    (await db.select({ stage: schema.lead.stage }).from(schema.lead).where(eq(schema.lead.id, leadId)))[0].stage;

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    leads = await import("@/lib/leads/service");
    manaLeads = await import("@/lib/mana/leads");
    sync = await import("@/lib/mana/sync");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    const rows = await db
      .insert(schema.studio)
      .values([
        { slug: `${tag}-a`, name: "A" },
        { slug: `${tag}-b`, name: "B" },
      ])
      .returning();
    studioA = rows[0].id;
    studioB = rows[1].id;
    for (const id of [studioA, studioB]) {
      await ensureDefaultPipeline(db, id);
      await db.insert(schema.studioSettings).values({ studioId: id });
    }
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(inArray(schema.lead.studioId, [studioA, studioB]));
    await db.delete(schema.person).where(inArray(schema.person.studioId, [studioA, studioB]));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioA, studioB]));
    await pool.end();
  });

  it("links a lead's person to Mana by email, ignoring case", async () => {
    await seedMana(studioA, [personRow("m-email", "Sara@Example.test", null)], {});
    const { person } = await newLead(studioA, { email: "sara@example.test" });
    expect(await manaLeads.matchPerson(db, studioA, person.id)).toBe("m-email");
  });

  it("links by phone when there is no email match, written the Swedish way", async () => {
    await seedMana(studioA, [personRow("m-phone", null, "+46701239999")], {});
    const { person } = await newLead(studioA, { phone: "070-123 99 99" });
    expect(await manaLeads.matchPerson(db, studioA, person.id)).toBe("m-phone");
  });

  it("does not link when a phone belongs to several Mana people", async () => {
    await seedMana(studioA, [personRow("m-fam1", null, "+46701110000"), personRow("m-fam2", null, "+46701110000")], {});
    const { person } = await newLead(studioA, { phone: "0701110000" });
    expect(await manaLeads.matchPerson(db, studioA, person.id)).toBeNull();
  });

  it("moves a lead to Won when the person joined after the lead came in, and records it as automatic", async () => {
    await seedMana(studioA, [personRow("m-join", "join@example.test", null)], {
      "m-join": [held({ id: "um-join", startDate: "2026-10-10", status: "active" })],
    });
    const { lead, person } = await newLead(studioA, { email: "join@example.test" }, new Date("2026-10-09T08:00:00Z"));
    await manaLeads.matchPerson(db, studioA, person.id);
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(true);
    expect(await stageOf(lead.id)).toBe("won");
    const found = await leads.getLead(db, studioA, lead.id);
    const move = found?.history.find((h) => h.kind === "stage_changed");
    expect(move?.kind === "stage_changed" && move.via).toBe("mana");
    expect(move?.authorName).toBeNull();
  });

  it("never wins a lead whose Mana account is staff or an owner, whatever memberships it holds", async () => {
    await seedMana(studioA, [personRow("m-coach", "coach@example.test", null, "staff")], {
      "m-coach": [held({ id: "um-coach", name: "Fri träning", startDate: "2026-10-10", status: "active", price: { amount: 0, currency: "SEK" } })],
    });
    const { lead, person } = await newLead(studioA, { email: "coach@example.test" }, new Date("2026-10-09T08:00:00Z"));
    await manaLeads.matchPerson(db, studioA, person.id);
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(false);
    expect(await stageOf(lead.id)).toBe("new_lead");
  });

  it("moves to Won only once, even if an owner moves it back", async () => {
    await seedMana(studioA, [personRow("m-once", "once@example.test", null)], {
      "m-once": [held({ id: "um-once", startDate: "2026-10-10" })],
    });
    const { lead, person } = await newLead(studioA, { email: "once@example.test" }, new Date("2026-10-09T08:00:00Z"));
    await manaLeads.matchPerson(db, studioA, person.id);
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(true);
    await leads.moveLeadStage(db, studioA, lead.id, "price_info");
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(false);
    expect(await stageOf(lead.id)).toBe("price_info");
  });

  it("does not close an existing member who gets in touch as Won", async () => {
    await seedMana(studioA, [personRow("m-old", "old@example.test", null)], {
      "m-old": [held({ id: "um-old", startDate: "2026-09-07" })],
    });
    const { lead, person } = await newLead(studioA, { email: "old@example.test" }, new Date("2026-10-09T08:00:00Z"));
    await manaLeads.matchPerson(db, studioA, person.id);
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(false);
    expect(await stageOf(lead.id)).toBe("new_lead");
    const info = await manaLeads.getManaInfo(db, studioA, "m-old");
    expect(info?.counting).toHaveLength(1); // it still shows that they are a member
  });

  it("does not count a membership the owners have marked as not a membership", async () => {
    await seedMana(studioA, [personRow("m-box", "box@example.test", null)], {
      "m-box": [held({ id: "um-box", membershipId: "locker", name: "Förvaringsbox", startDate: "2026-10-10" })],
    });
    await db.update(schema.studioSettings).set({ ignoredMembershipIds: ["locker"] }).where(eq(schema.studioSettings.studioId, studioA));
    const { lead, person } = await newLead(studioA, { email: "box@example.test" }, new Date("2026-10-09T08:00:00Z"));
    await manaLeads.matchPerson(db, studioA, person.id);
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(false);
    await db.update(schema.studioSettings).set({ ignoredMembershipIds: [] }).where(eq(schema.studioSettings.studioId, studioA));
  });

  it("wins a cold lead who joins after all", async () => {
    await seedMana(studioA, [personRow("m-cold", "cold@example.test", null)], {
      "m-cold": [held({ id: "um-cold", startDate: "2026-10-20" })],
    });
    const { lead, person } = await newLead(studioA, { email: "cold@example.test" }, new Date("2026-10-09T08:00:00Z"));
    await leads.moveLeadStage(db, studioA, lead.id, "cold", { coldReason: "price" });
    await manaLeads.matchPerson(db, studioA, person.id);
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(true);
    const row = (await db.select().from(schema.lead).where(eq(schema.lead.id, lead.id)))[0];
    expect(row.stage).toBe("won");
    expect(row.coldReason).toBeNull();
  });

  it("leaves a lead with no Mana match unchanged", async () => {
    const { lead, person } = await newLead(studioA, { email: "nobody-in-mana@example.test" });
    expect(await manaLeads.matchPerson(db, studioA, person.id)).toBeNull();
    expect(await manaLeads.detectWonForLead(db, studioA, lead.id)).toBe(false);
    expect(await stageOf(lead.id)).toBe("new_lead");
    expect((await leads.getLead(db, studioA, lead.id))?.history).toHaveLength(0);
  });

  it("after a sync, links everyone and wins the new members' leads, studio by studio", async () => {
    await seedMana(studioB, [personRow("b-new", "bnew@example.test", null)], {
      "b-new": [held({ id: "um-bnew", startDate: "2026-10-12" })],
    });
    const { lead } = await newLead(studioB, { email: "bnew@example.test" }, new Date("2026-10-10T08:00:00Z"));
    // A lead in the other studio with the same email is not touched.
    const other = await newLead(studioA, { email: "bnew@example.test" }, new Date("2026-10-10T08:00:00Z"));
    expect(await manaLeads.afterSync(db, studioB)).toBe(1);
    expect(await stageOf(lead.id)).toBe("won");
    expect(await stageOf(other.lead.id)).toBe("new_lead");
  });

  describe("live lookup when a lead is opened", () => {
    class FakeLive {
      lastRequestAt: number | null = null;
      searches: string[] = [];
      membershipCalls: string[] = [];
      constructor(
        private people: ReturnType<typeof personRow>[],
        private memberships: Record<string, Held[]>,
      ) {}
      async searchUsers(term: string) {
        this.searches.push(term);
        return this.people.filter((p) =>
          [p.profile.email, p.profile.phone].some((v) => v?.toLowerCase().includes(term.toLowerCase())),
        ) as never;
      }
      async getUserMemberships(id: string) {
        this.membershipCalls.push(id);
        return (this.memberships[id] ?? []) as never;
      }
      async getUsersPage(): Promise<never> {
        throw new Error("a live lookup must not read every page");
      }
    }

    it("finds a brand new member, saves them and wins the lead, without waiting for the nightly sync", async () => {
      const { lead, person } = await newLead(studioA, { email: "fresh@example.test" }, new Date("2026-10-09T08:00:00Z"));
      const live = new FakeLive([personRow("m-fresh", "fresh@example.test", "+46705550000")], {
        "m-fresh": [held({ id: "um-fresh", startDate: "2026-10-11" })],
      });
      expect(await manaLeads.refreshPersonFromMana(db, live, studioA, person.id)).toBe(true);
      expect(live.searches).toEqual(["fresh@example.test"]);
      expect(await stageOf(lead.id)).toBe("won");
      const [member] = await db
        .select()
        .from(schema.manaMember)
        .where(and(eq(schema.manaMember.studioId, studioA), eq(schema.manaMember.manaUserId, "m-fresh")));
      expect(member.emailNormalized).toBe("fresh@example.test");
    });

    it("does not ask Mana again within ten minutes", async () => {
      const { person } = await newLead(studioA, { email: "again@example.test" });
      const live = new FakeLive([], {});
      const now = new Date();
      await manaLeads.refreshPersonFromMana(db, live, studioA, person.id, now);
      await manaLeads.refreshPersonFromMana(db, live, studioA, person.id, new Date(now.getTime() + 5 * 60_000));
      expect(live.searches).toHaveLength(1);
      await manaLeads.refreshPersonFromMana(db, live, studioA, person.id, new Date(now.getTime() + 11 * 60_000));
      expect(live.searches).toHaveLength(2);
    });

    it("searches by phone when the lead has no email, and ignores near misses", async () => {
      const { person } = await newLead(studioA, { phone: "070-777 66 55" });
      const live = new FakeLive(
        [personRow("m-tel", null, "+46707776655"), personRow("m-near", null, "+46707776656")],
        {},
      );
      await manaLeads.refreshPersonFromMana(db, live, studioA, person.id);
      expect(live.searches).toEqual(["707776655"]);
      const linked = (await db.select().from(schema.person).where(eq(schema.person.id, person.id)))[0];
      expect(linked.manaUserId).toBe("m-tel");
    });

    it("changes nothing when Mana does not know the person", async () => {
      const { lead, person } = await newLead(studioA, { email: "unknown-live@example.test" });
      const live = new FakeLive([], {});
      expect(await manaLeads.refreshPersonFromMana(db, live, studioA, person.id)).toBe(false);
      expect(await stageOf(lead.id)).toBe("new_lead");
      expect(live.membershipCalls).toHaveLength(0);
    });
  });
});
