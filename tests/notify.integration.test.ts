import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Discord notices", () => {
  const tag = `notify-${Date.now()}`;
  let studioId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let leads: typeof import("@/lib/leads/service");
  let notify: typeof import("@/lib/notify/service");
  const H = 3_600_000;
  const now = new Date("2026-10-15T08:00:00Z");

  const posts: string[] = [];
  const post = async (content: string) => {
    posts.push(content);
    return "sent" as const;
  };

  const newLead = async (hoursAgo: number, name = "Testperson") => {
    const { lead } = await leads.createOrMatchLead(db, studioId, { name: `${name} ${tag}`, email: `${name.toLowerCase()}-${hoursAgo}-${tag}@example.test`, phone: "", source: "contact_form" });
    const at = new Date(now.getTime() - hoursAgo * H);
    await db.update(schema.lead).set({ createdAt: at, updatedAt: at }).where(eq(schema.lead.id, lead.id));
    return lead;
  };

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    leads = await import("@/lib/leads/service");
    notify = await import("@/lib/notify/service");
    const { ensureDefaultPipeline } = await import("@/lib/pipeline/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Notis" }).returning();
    await ensureDefaultPipeline(db, studioId);
    await db.insert(schema.studioSettings).values({ studioId });
  });

  afterAll(async () => {
    await db.delete(schema.lead).where(eq(schema.lead.studioId, studioId));
    await db.delete(schema.person).where(eq(schema.person.studioId, studioId));
    await db.delete(schema.studio).where(inArray(schema.studio.id, [studioId]));
    await pool.end();
  });

  it("waits until the deadline, then posts once that a lead was not contacted", async () => {
    const fresh = await newLead(2);
    const state = await notify.firstContactState(db, studioId, fresh.id, now);
    // 24 hours by default, every day of the week.
    expect(state).toEqual({ state: "waiting", until: new Date(now.getTime() + 22 * H).toISOString() });

    const late = await newLead(30, "Sen");
    expect(await notify.notifyOverdue(db, studioId, late.id, now, post)).toBe("sent");
    expect(await notify.notifyOverdue(db, studioId, late.id, now, post)).toBe("already_sent");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("Kontaktformulär");
    expect(posts[0]).toContain(`/leads/${late.id}`);
    // No personal data in the post.
    expect(posts[0]).not.toContain(tag);
  });

  it("posts nothing for a lead someone has moved on", async () => {
    const handled = await newLead(30, "Klar");
    await leads.moveLeadStage(db, studioId, handled.id, "contacted");
    expect(await notify.notifyOverdue(db, studioId, handled.id, now, post)).toBe("done");
    expect(posts).toHaveLength(1);
  });

  it("lets go of the claim when a post fails, so the next try posts it", async () => {
    const late = await newLead(40, "Igen");
    expect(await notify.notifyOverdue(db, studioId, late.id, now, async () => "failed")).toBe("failed");
    expect(await notify.notifyOverdue(db, studioId, late.id, now, post)).toBe("sent");
  });

  it("sums up the morning once a day", async () => {
    const summary = await notify.buildSummary(db, studioId, now);
    // Yesterday in Stockholm is 14 Oct: the two 30-hour-old leads (04:00 local). The 40-hour-old one came on 13 Oct.
    // Overdue now: the two late ones nobody moved; the one moved to Kontaktad is not.
    expect(summary.day).toBe("2026-10-15");
    expect(summary.newYesterday).toEqual({ contact_form: 2 });
    expect(summary.overdueFirstContact).toBe(2);
    expect(await notify.postDailySummary(db, studioId, now, post)).toBe("sent");
    expect(await notify.postDailySummary(db, studioId, now, post)).toBe("already_sent");
  });
});
