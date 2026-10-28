import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("user management", () => {
  const tag = `users-${Date.now()}`;
  let studioId: string;
  let ownerId: string;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let schema: typeof import("@/db/schema");
  let users: typeof import("@/lib/users/service");
  let signIn: (email: string, password: string) => Promise<Response>;

  beforeAll(async () => {
    ({ db, pool } = await import("@/db"));
    schema = await import("@/db/schema");
    users = await import("@/lib/users/service");
    const { auth } = await import("@/lib/auth");
    [{ id: studioId }] = await db.insert(schema.studio).values({ slug: tag, name: "Users" }).returning();
    await db.insert(schema.studioSettings).values({ studioId });
    const ctx = await auth.$context;
    ({ id: ownerId } = await ctx.internalAdapter.createUser(
      { email: `${tag}-owner@example.test`, name: "Ägare", emailVerified: true, role: "owner", studioId },
      { method: "admin" } as never,
    ));
    signIn = (email, password) =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `10.1.0.${Math.floor(Math.random() * 250) + 1}` },
          body: JSON.stringify({ email, password }),
        }),
      );
  });

  afterAll(async () => {
    await db.delete(schema.user).where(like(schema.user.email, `${tag}%`));
    await db.delete(schema.studio).where(eq(schema.studio.id, studioId));
    await pool.end();
  });

  it("adds a user who chooses their own password from a one-time link, then signs in", async () => {
    const email = `${tag}-timmy@example.test`;
    const { userId, token } = await users.addUser(db, studioId, { name: "Timmy", email: email.toUpperCase(), role: "staff" }, ownerId);
    const [listed] = (await users.listUsers(db, studioId)).filter((u) => u.id === userId);
    expect(listed).toMatchObject({ email, role: "staff", active: true, hasPassword: false, linkPending: true });

    expect((await signIn(email, "ett-bra-losenord")).status).not.toBe(200);
    await users.redeemInvite(db, token, "ett-bra-losenord");
    expect((await signIn(email, "ett-bra-losenord")).status).toBe(200);
    expect((await users.listUsers(db, studioId)).find((u) => u.id === userId)).toMatchObject({ hasPassword: true, linkPending: false });
    // One use only.
    await expect(users.redeemInvite(db, token, "ett-annat-losenord")).rejects.toThrow("not_found");
  });

  it("refuses a taken email, a short password and an expired link", async () => {
    await expect(users.addUser(db, studioId, { name: "Dubblett", email: `${tag}-timmy@example.test`, role: "staff" }, ownerId)).rejects.toThrow("email_taken");
    const { userId } = await users.addUser(db, studioId, { name: "Fredrik", email: `${tag}-fredrik@example.test`, role: "owner" }, ownerId);
    const old = await users.createInvite(db, userId, ownerId, new Date(Date.now() - 8 * 86_400_000));
    await expect(users.redeemInvite(db, old, "ett-bra-losenord")).rejects.toThrow("not_found");
    const fresh = await users.createInvite(db, userId, ownerId);
    await expect(users.redeemInvite(db, fresh, "kort")).rejects.toThrow("invalid");
  });

  it("a new link replaces a forgotten password and the old link", async () => {
    const [timmy] = (await users.listUsers(db, studioId)).filter((u) => u.email === `${tag}-timmy@example.test`);
    const first = await users.createInvite(db, timmy.id, ownerId);
    const second = await users.createInvite(db, timmy.id, ownerId);
    expect(await users.inviteFor(db, first)).toBeNull();
    await users.redeemInvite(db, second, "nytt-losenord-123");
    expect((await signIn(timmy.email, "ett-bra-losenord")).status).not.toBe(200);
    expect((await signIn(timmy.email, "nytt-losenord-123")).status).toBe(200);
  });

  it("switching someone off ends their sessions, blocks sign-in and is seen at once; an owner cannot change themselves", async () => {
    const [timmy] = (await users.listUsers(db, studioId)).filter((u) => u.email === `${tag}-timmy@example.test`);
    await users.setActive(db, studioId, timmy.id, false, ownerId);
    expect((await users.accountState(db, timmy.id)).switchedOff).toBe(true);
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, timmy.id))).toEqual([]);
    expect((await signIn(timmy.email, "nytt-losenord-123")).status).not.toBe(200);
    await users.setActive(db, studioId, timmy.id, true, ownerId);
    expect((await users.accountState(db, timmy.id)).switchedOff).toBe(false);

    await users.setRole(db, studioId, timmy.id, "owner", ownerId);
    expect((await users.listUsers(db, studioId)).find((u) => u.id === timmy.id)?.role).toBe("owner");
    // What every request reads, so a changed role applies before the session cookie expires.
    expect((await users.accountState(db, timmy.id)).role).toBe("owner");
    await expect(users.setRole(db, studioId, ownerId, "staff", ownerId)).rejects.toThrow("self");
    await expect(users.setActive(db, studioId, ownerId, false, ownerId)).rejects.toThrow("self");
  });
});
