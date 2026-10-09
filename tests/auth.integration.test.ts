import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sign-in against the real database", () => {
  const tag = `test-${Date.now()}`;
  const ownerEmail = `${tag}-owner@example.test`;
  const staffEmail = `${tag}-staff@example.test`;
  const password = "correct-horse-battery";
  let call: (path: string, body?: unknown, cookie?: string) => Promise<Response>;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const { db, pool } = await import("@/db");
    const { studio, studioSettings, user } = await import("@/db/schema");
    const { auth } = await import("@/lib/auth");

    const [existing] = await db.select().from(studio).where(eq(studio.slug, `tegen-${tag}`));
    const row =
      existing ??
      (await db.insert(studio).values({ slug: `tegen-${tag}`, name: "Test" }).returning())[0];
    await db.insert(studioSettings).values({ studioId: row.id }).onConflictDoNothing();

    const ctx = await auth.$context;
    for (const [email, role] of [
      [ownerEmail, "owner"],
      [staffEmail, "staff"],
    ] as const) {
      const created = await ctx.internalAdapter.createUser(
        { email, name: role, emailVerified: true, role, studioId: row.id },
        { method: "admin" },
      );
      await ctx.internalAdapter.linkAccount({
        userId: created.id,
        providerId: "credential",
        accountId: created.id,
        password: await ctx.password.hash(password),
      });
    }

    call = (path, body, cookie) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
            // A unique address per request keeps the rate limiter out of unrelated tests.
            "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
            ...(cookie ? { cookie } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );

    cleanup = async () => {
      await db.delete(user).where(like(user.email, `${tag}%`));
      await db.delete(studio).where(eq(studio.id, row.id));
      await pool.end();
    };
  });

  afterAll(async () => {
    await cleanup?.();
  });

  async function signIn(email: string, pw: string) {
    return call("/sign-in/email", { email, password: pw });
  }

  it("signs in a known user and returns their role", async () => {
    const response = await signIn(ownerEmail, password);
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const session = await (await call("/get-session", undefined, cookie)).json();
    expect(session.user.role).toBe("owner");
  });

  it("returns the staff role for a staff user", async () => {
    const response = await signIn(staffEmail, password);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const session = await (await call("/get-session", undefined, cookie)).json();
    expect(session.user.role).toBe("staff");
  });

  it("refuses a wrong password", async () => {
    expect((await signIn(ownerEmail, "wrong-password-123")).status).toBe(401);
  });

  it("refuses an unknown email", async () => {
    expect((await signIn(`${tag}-nobody@example.test`, password)).status).toBe(401);
  });

  it("does not let anyone create their own account", async () => {
    const response = await call("/sign-up/email", {
      email: `${tag}-new@example.test`,
      password,
      name: "Ny",
    });
    expect(response.ok).toBe(false);
  });
});
