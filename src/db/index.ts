import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

/**
 * The pool does not connect until the first query, so importing this module
 * (for example during `next build`) works without a database. A missing
 * DATABASE_URL shows up as a clear error when a query runs.
 */
export const pool = (globalForDb.pool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
}));
export const db = drizzle(pool, { schema });
