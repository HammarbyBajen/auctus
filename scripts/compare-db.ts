/**
 * Compares two databases table by table: row counts and the newest row, never
 * the rows themselves. For trying a restore (ticket 18, docs/runbook.md):
 * point a git-ignored env file at a Neon branch made from a point in time,
 * then compare it with production. Read only.
 *
 *   pnpm tsx scripts/compare-db.ts --a .env.production.local --b .env.restore-test.local
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse } from "dotenv";
import { Pool } from "pg";

const { values } = parseArgs({ options: { a: { type: "string" }, b: { type: "string" } } });
if (!values.a || !values.b) throw new Error("Give --a and --b (two env files with DATABASE_URL)");

/** The tables that hold Tegen's own work, and the column that says when a row was made. */
const tables: [string, string | null][] = [
  ["person", "created_at"],
  ["lead", "created_at"],
  ["lead_event", "created_at"],
  ["lead_note", "created_at"],
  ["task", "created_at"],
  ["lead_submission", "received_at"],
  ["email_message", "created_at"],
  ["at_risk_alert", "created_at"],
  ["user", "created_at"],
  ["mana_member", "synced_at"],
  ["mana_membership", "synced_at"],
  ["kpi_snapshot", "created_at"],
  ["sync_run", "started_at"],
];

const urlFrom = (file: string) => {
  const url = parse(readFileSync(file))["DATABASE_URL"];
  if (!url) throw new Error(`${file} has no DATABASE_URL`);
  return url;
};

async function snapshot(url: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  pool.on("error", () => {});
  const out = new Map<string, { rows: number; newest: string | null }>();
  for (const [table, at] of tables) {
    const { rows } = await pool.query(`select count(*)::int as n${at ? `, max(${at})::text as newest` : ""} from "${table}"`);
    out.set(table, { rows: rows[0].n, newest: rows[0].newest ?? null });
  }
  await pool.end();
  return out;
}

async function main() {
  const [a, b] = await Promise.all([snapshot(urlFrom(values.a!)), snapshot(urlFrom(values.b!))]);
  console.log(`table               ${values.a!.padEnd(28)} ${values.b}`);
  for (const [table] of tables) {
    const x = a.get(table)!;
    const y = b.get(table)!;
    const mark = x.rows === y.rows ? " " : "*";
    console.log(`${mark} ${table.padEnd(17)} ${String(x.rows).padStart(6)}  ${(x.newest ?? "").slice(0, 19).padEnd(20)} ${String(y.rows).padStart(6)}  ${(y.newest ?? "").slice(0, 19)}`);
  }
  console.log("\n* = different row counts. A restore from a point in time should match production as it was then: fewer rows only where something was added after that point.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
