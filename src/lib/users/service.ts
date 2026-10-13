import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { account, session, user, userInvite } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isRole, type Role } from "@/lib/permissions";

type Db = typeof defaultDb;

/**
 * User management (ticket 14). Owners add people, set their role and switch
 * them off. Nobody signs up by themselves: an owner makes the account and a
 * personal link (valid 7 days, one use) that the person opens to choose their
 * own password. The same kind of link replaces a forgotten password.
 */

export const inviteDays = 7;
export const minPasswordLength = 10;

export class UserError extends Error {
  constructor(public code: "email_taken" | "not_found" | "self" | "invalid") {
    super(code);
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type StudioUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  active: boolean;
  hasPassword: boolean;
  /** A link was made and has not been used or run out yet. */
  linkPending: boolean;
};

export async function listUsers(db: Db, studioId: string, now: Date = new Date()): Promise<StudioUser[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      // "user"."id" is written out: inside the subquery a bare "id" would mean the subquery's own row.
      hasPassword: sql<boolean>`exists (select 1 from ${account} a where a.user_id = "user"."id" and a.provider_id = 'credential' and a.password is not null)`,
      linkPending: sql<boolean>`exists (select 1 from ${userInvite} i where i.user_id = "user"."id" and i.used_at is null and i.expires_at > ${now})`,
    })
    .from(user)
    .where(eq(user.studioId, studioId))
    .orderBy(user.name);
  return rows.map((r) => ({ ...r, role: isRole(r.role) ? r.role : null, active: !r.banned }));
}

/** A new personal link for a user; any earlier unused one stops working. Returns the token, shown once. */
export async function createInvite(db: Db, userId: string, createdById: string, now: Date = new Date()) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(userInvite).where(and(eq(userInvite.userId, userId), isNull(userInvite.usedAt)));
  await db.insert(userInvite).values({
    tokenHash: hashToken(token),
    userId,
    createdById,
    createdAt: now,
    expiresAt: new Date(now.getTime() + inviteDays * 86_400_000),
  });
  return token;
}

/** Adds a person to the studio with a role, and makes their first link. */
export async function addUser(
  db: Db,
  studioId: string,
  input: { name: string; email: string; role: Role },
  createdById: string,
  now: Date = new Date(),
) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("invalid");
  const [taken] = await db.select({ id: user.id }).from(user).where(eq(sql`lower(${user.email})`, email)).limit(1);
  if (taken) throw new UserError("email_taken");
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({ email, name, emailVerified: true, role: input.role, studioId }, { method: "admin" } as never);
  const token = await createInvite(db, created.id, createdById, now);
  return { userId: created.id, token };
}

/** Whom a link belongs to, if it can still be used (unused, in time, account not switched off). */
export async function inviteFor(db: Db, token: string, now: Date = new Date()) {
  const [row] = await db
    .select({ userId: userInvite.userId, name: user.name, email: user.email, banned: user.banned })
    .from(userInvite)
    .innerJoin(user, eq(user.id, userInvite.userId))
    .where(and(eq(userInvite.tokenHash, hashToken(token)), isNull(userInvite.usedAt), gt(userInvite.expiresAt, now)))
    .limit(1);
  return row && !row.banned ? row : null;
}

/**
 * Uses a link: sets the person's password, uses up the link and signs them
 * out everywhere (a reset should end any session someone else might hold).
 */
export async function redeemInvite(db: Db, token: string, password: string, now: Date = new Date()) {
  if (password.length < minPasswordLength) throw new UserError("invalid");
  const found = await inviteFor(db, token, now);
  if (!found) throw new UserError("not_found");
  const ctx = await auth.$context;
  const hashed = await ctx.password.hash(password);
  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, found.userId), eq(account.providerId, "credential")))
    .limit(1);
  if (existing) {
    await db.update(account).set({ password: hashed, updatedAt: now }).where(eq(account.id, existing.id));
  } else {
    await ctx.internalAdapter.linkAccount({ userId: found.userId, providerId: "credential", accountId: found.userId, password: hashed });
  }
  await db.update(userInvite).set({ usedAt: now }).where(eq(userInvite.tokenHash, hashToken(token)));
  await db.delete(session).where(eq(session.userId, found.userId));
  return { email: found.email };
}

async function inStudio(db: Db, studioId: string, userId: string) {
  const [found] = await db.select({ id: user.id }).from(user).where(and(eq(user.id, userId), eq(user.studioId, studioId))).limit(1);
  if (!found) throw new UserError("not_found");
}

/** Changes someone's role. Not your own, so an owner cannot demote themselves by mistake. */
export async function setRole(db: Db, studioId: string, userId: string, role: Role, actorId: string) {
  if (userId === actorId) throw new UserError("self");
  await inStudio(db, studioId, userId);
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId));
}

/**
 * Switches someone off or back on. Switching off ends their sessions and links
 * at once; every page also checks it (see lib/session.ts), so it holds within
 * the session cookie's cache time too. Not yourself, so an owner is never locked out.
 */
export async function setActive(db: Db, studioId: string, userId: string, active: boolean, actorId: string) {
  if (userId === actorId) throw new UserError("self");
  await inStudio(db, studioId, userId);
  await db.update(user).set({ banned: !active, updatedAt: new Date() }).where(eq(user.id, userId));
  if (!active) {
    await db.delete(session).where(eq(session.userId, userId));
    await db.delete(userInvite).where(and(eq(userInvite.userId, userId), isNull(userInvite.usedAt)));
  }
}

/** Whether an account has been switched off. One small lookup per page. */
export async function isSwitchedOff(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, userId)).limit(1);
  return !row || Boolean(row.banned);
}

/** The latest link made for a user (for showing when it runs out). */
export async function latestInvite(db: Db, userId: string) {
  const [row] = await db.select().from(userInvite).where(eq(userInvite.userId, userId)).orderBy(desc(userInvite.createdAt)).limit(1);
  return row ?? null;
}
