/**
 * Creates a throwaway owner for trying the app locally (dev-owner@example.test).
 * Refuses to run unless DATABASE_URL points at localhost. The password is
 * generated once and stored as DEV_USER_PASSWORD in .env.local.
 */
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Refusing to create a dev user: DATABASE_URL is not localhost");
  }
  let password = process.env.DEV_USER_PASSWORD;
  if (!password) {
    password = randomBytes(12).toString("hex");
    appendFileSync(".env.local", `DEV_USER_PASSWORD=${password}\n`);
  }

  const { db, pool } = await import("../src/db");
  const { studio, user } = await import("../src/db/schema");
  const { auth } = await import("../src/lib/auth");

  const [tegen] = await db.select().from(studio).where(eq(studio.slug, "tegen"));
  if (!tegen) throw new Error("Run pnpm db:seed first");
  const email = "dev-owner@example.test";
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) {
    console.log("Dev user already exists:", email);
  } else {
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser(
      { email, name: "Dev Ägare", emailVerified: true, role: "owner", studioId: tegen.id },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await ctx.password.hash(password),
    });
    console.log("Created dev user:", email);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
