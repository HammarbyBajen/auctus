import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Timestamps are stored without a time zone. The app writes them in UTC, and
 * the database writes "now" in its own zone. They only agree when the database
 * runs in UTC, which Neon and the CI database do. A local database in another
 * zone makes new leads look hours in the future, so this fails loudly instead.
 * Fix a local one with: ALTER DATABASE tegen_crm SET timezone TO 'UTC';
 */
describe.skipIf(!hasDb)("database time zone", () => {
  afterAll(async () => {
    const { pool } = await import("@/db");
    await pool.end();
  });

  it("runs in UTC, so the app and the database agree on what time it is", async () => {
    const { pool } = await import("@/db");
    const { rows } = await pool.query(
      `select extract(timezone from now())::int as offset_seconds,
              to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS') as stamp`,
    );
    // UTC goes by several names (UTC, Etc/UTC, GMT), so check the offset, which must be zero.
    expect(rows[0].offset_seconds).toBe(0);
    // The wall clock the database writes for "now", read as text so no driver can reinterpret it,
    // is the same one the app writes when it stores a JavaScript date.
    const dbNow = new Date(`${rows[0].stamp}Z`);
    expect(Math.abs(dbNow.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
