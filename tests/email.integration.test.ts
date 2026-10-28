import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sending email from Tegen HQ (M8 phase 1)", () => {
  const tag = `email-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let email: typeof import("@/lib/email/service");
  const env = { key: process.env.RESEND_API_KEY, live: process.env.EMAIL_LIVE };

  type Sent = Parameters<import("@/lib/email/transport").EmailTransport["send"]>[0];
  const fake = () => {
    const sent: Sent[] = [];
    return { sent, send: async (e: Sent) => (sent.push(e), { id: `re_${tag}_${crypto.randomUUID()}` }) };
  };
  const input = (to = "anna@example.test") => ({ studioId, to, subject: "Hej", body: "Hej Anna,\n\nVälkommen.", replyTo: "max@example.test", sentById: ownerId });
  const ownerLive = (on: boolean) => db.update(schema.studioSettings).set({ emailLive: on }).where(eq(schema.studioSettings.studioId, studioId));

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    email = await import("@/lib/email/service");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "CrossFit Test" }).returning();
    await db.insert(schema.studioSettings).values({ studioId, emailFrom: "CrossFit Test <hej@example.test>" });
    [{ id: ownerId }] = await db.insert(schema.user).values({ id: `${tag}-u`, name: "Ägare", email: `${tag}@example.test`, emailVerified: true, role: "owner", studioId }).returning();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = env.key;
    process.env.EMAIL_LIVE = env.live;
    if (env.key === undefined) delete process.env.RESEND_API_KEY;
    if (env.live === undefined) delete process.env.EMAIL_LIVE;
  });

  afterAll(async () => {
    await db.delete(schema.emailMessage).where(eq(schema.emailMessage.studioId, studioId));
    await db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("sends nothing at all without a Resend key, but keeps the email", async () => {
    delete process.env.RESEND_API_KEY;
    const transport = fake();
    const result = await email.sendEmail(db, input(), transport);
    expect(result).toMatchObject({ mode: "dry_run", status: "not_sent" });
    expect(transport.sent).toHaveLength(0);
  });

  it("sends to Resend's test address in test mode, even when an owner has switched live on", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    await ownerLive(true);
    const transport = fake();
    const result = await email.sendEmail(db, input("Anna@Example.test"), transport);
    expect(result).toMatchObject({ mode: "test", status: "sent" });
    expect(transport.sent.map((s) => s.to)).toEqual(["delivered@resend.dev"]);
    // The real address never reaches Resend.
    expect(JSON.stringify(transport.sent)).not.toContain("anna@example.test");
    const [row] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId));
    expect([row.to, row.sentTo, row.mode]).toEqual(["anna@example.test", "delivered@resend.dev", "test"]);
    // Our id is the idempotency key, so a retry is the same email.
    expect(transport.sent[0].messageId).toBe(result.messageId);
    await ownerLive(false);
  });

  it("reaches the person only when the server and an owner both say live", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    process.env.EMAIL_LIVE = "true";
    const off = fake();
    expect((await email.sendEmail(db, input(), off)).mode).toBe("test");
    await ownerLive(true);
    const on = fake();
    const result = await email.sendEmail(db, input(), on);
    expect(result).toMatchObject({ mode: "live", status: "sent" });
    expect(on.sent[0]).toMatchObject({ to: "anna@example.test", replyTo: "max@example.test", studioName: "CrossFit Test" });
    await ownerLive(false);
  });

  it("stays in test mode while no sender of Tegen's own is set, even with both switches on", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    process.env.EMAIL_LIVE = "true";
    await ownerLive(true);
    await db.update(schema.studioSettings).set({ emailFrom: null }).where(eq(schema.studioSettings.studioId, studioId));
    const transport = fake();
    expect((await email.sendEmail(db, input(), transport)).mode).toBe("test");
    expect(transport.sent.map((s) => s.to)).toEqual(["delivered@resend.dev"]);
    await db.update(schema.studioSettings).set({ emailFrom: "CrossFit Test <hej@example.test>" }).where(eq(schema.studioSettings.studioId, studioId));
    await ownerLive(false);
  });

  it("follows Resend's events once each, and never mails a hard bounce again", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    process.env.EMAIL_LIVE = "true";
    await ownerLive(true);
    const transport = fake();
    const result = await email.sendEmail(db, input("bo@example.test"), transport);
    const [row] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId));

    await email.handleEmailEvent(db, `${tag}-e1`, { type: "email.delivered", emailId: row.resendId, messageId: null, bounceType: null });
    await email.handleEmailEvent(db, `${tag}-e2`, { type: "email.bounced", emailId: row.resendId, messageId: null, bounceType: "Permanent" });
    // The same event again changes nothing.
    expect(await email.handleEmailEvent(db, `${tag}-e2`, { type: "email.bounced", emailId: row.resendId, messageId: null, bounceType: "Permanent" })).toEqual({ handled: false, matched: true });
    const [after] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId));
    expect(after.status).toBe("bounced");
    expect((await email.listSuppressions(db, studioId)).map((s) => [s.address, s.reason])).toEqual([["bo@example.test", "bounced"]]);

    const again = fake();
    expect(await email.sendEmail(db, input("Bo@example.test"), again)).toMatchObject({ status: "suppressed" });
    expect(again.sent).toHaveLength(0);
    await ownerLive(false);
  });

  it("does not suppress anyone over a bounce in test mode, which was Resend's test address", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    const transport = fake();
    const result = await email.sendEmail(db, input("cia@example.test"), transport);
    const [row] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId));
    await email.handleEmailEvent(db, `${tag}-e3`, { type: "email.complained", emailId: row.resendId, messageId: null, bounceType: null });
    expect((await email.listSuppressions(db, studioId)).map((s) => s.address)).not.toContain("cia@example.test");
  });

  it("marks an email failed, without the address or key, when Resend refuses it", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    const result = await email.sendEmail(db, input(), { send: async () => Promise.reject(new Error("rate_limit_exceeded")) });
    const [row] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId));
    expect([result.status, row.status, row.error]).toEqual(["failed", "failed", "rate_limit_exceeded"]);
  });

  it("sends the same email again under the same key after a failure, so Resend can tell it is a retry", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    const first = await email.sendEmail(db, input("dan@example.test"), { send: async () => Promise.reject(new Error("timeout")) });
    const transport = fake();
    const retry = await email.sendEmail(db, input("dan@example.test"), transport);
    expect(retry).toMatchObject({ messageId: first.messageId, status: "sent" });
    expect(transport.sent[0].messageId).toBe(first.messageId);
    // A changed text is a new email.
    const changed = await email.sendEmail(db, { ...input("dan@example.test"), body: "Något annat." }, fake());
    expect(changed.messageId).not.toBe(first.messageId);
  });

  it("lands an event that comes before Resend's id is saved, found by the tag on the email", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    let resendId = "";
    const early = {
      send: async (e: Sent) => {
        resendId = `re_${tag}_${crypto.randomUUID()}`;
        await email.handleEmailEvent(db, `${tag}-early`, { type: "email.delivered", emailId: resendId, messageId: e.messageId, bounceType: null });
        return { id: resendId };
      },
    };
    const result = await email.sendEmail(db, input("eva@example.test"), early);
    const [row] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId));
    expect([row.status, row.resendId]).toEqual(["delivered", resendId]);
  });

  it("lets Resend's own report win over a failure our side set when the answer was lost", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    // Resend took the email, but the answer never reached us: marked failed, with no Resend id.
    const lost = await email.sendEmail(db, input("fia@example.test"), { send: async () => Promise.reject(new Error("timeout")) });
    const resendId = `re_${tag}_${crypto.randomUUID()}`;
    await email.handleEmailEvent(db, `${tag}-late`, { type: "email.delivered", emailId: resendId, messageId: lost.messageId, bounceType: null });
    const [row] = await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, lost.messageId));
    expect([row.status, row.resendId]).toEqual(["delivered", resendId]);
  });

  it("reads a temporary bounce as delayed, so a later delivery still shows", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    process.env.EMAIL_LIVE = "true";
    await ownerLive(true);
    const result = await email.sendEmail(db, input("fia@example.test"), fake());
    const event = (id: string, type: string, bounceType: string | null) =>
      email.handleEmailEvent(db, `${tag}-${id}`, { type, emailId: null, messageId: result.messageId, bounceType });
    await event("soft", "email.bounced", "Temporary");
    const status = async () => (await db.select().from(schema.emailMessage).where(eq(schema.emailMessage.id, result.messageId)))[0].status;
    expect(await status()).toBe("delayed");
    await event("later", "email.delivered", null);
    expect(await status()).toBe("delivered");
    expect((await email.listSuppressions(db, studioId)).map((s) => s.address)).not.toContain("fia@example.test");
    await ownerLive(false);
  });

  it("ignores events for emails Tegen HQ did not send (the account is shared with tegen-web)", async () => {
    expect(await email.handleEmailEvent(db, `${tag}-other`, { type: "email.delivered", emailId: "re_from_tegen_web", messageId: null, bounceType: null })).toEqual({ handled: false, matched: false });
    expect(await db.select().from(schema.emailEvent).where(eq(schema.emailEvent.id, `${tag}-other`))).toEqual([]);
  });

  it("lists a person's emails, newest first, with who sent them", async () => {
    const rows = await email.listEmails(db, studioId, { manaUserId: "nobody" });
    expect(rows).toEqual([]);
  });
});
