/**
 * Creates the Tegen studio, its settings and the first owner. Safe to run twice.
 * Reads SEED_OWNER_EMAIL, SEED_OWNER_NAME and SEED_OWNER_PASSWORD from .env.local.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

async function main() {
  const { db, pool } = await import("../src/db");
  const { studio, studioSettings, user } = await import("../src/db/schema");
  const { auth } = await import("../src/lib/auth");

  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME ?? "Ägare";
  if (!email || !password) {
    throw new Error("Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in .env.local");
  }

  const [existingStudio] = await db.select().from(studio).where(eq(studio.slug, "tegen"));
  const tegen =
    existingStudio ??
    (await db.insert(studio).values({ slug: "tegen", name: "CrossFit Tegen" }).returning())[0];
  await db.insert(studioSettings).values({ studioId: tegen.id }).onConflictDoNothing();

  const [existingUser] = await db.select().from(user).where(eq(user.email, email));
  if (existingUser) {
    console.log("Owner already exists:", email);
  } else {
    const ctx = await auth.$context;
    const created = await ctx.internalAdapter.createUser(
      {
        email,
        name,
        emailVerified: true,
        role: "owner",
        studioId: tegen.id,
      },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: await ctx.password.hash(password),
    });
    console.log("Created owner:", email);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
