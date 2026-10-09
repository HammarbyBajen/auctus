/**
 * Imports open leads from a Pipedrive export (ticket 15). A dry run unless
 * --apply is given. Prints counts only, never names or contact details.
 *
 *   pnpm import:pipedrive --deals deals.csv --people people.csv [--apply] [--env .env.production.local]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

const { values } = parseArgs({
  options: {
    deals: { type: "string" },
    people: { type: "string" },
    apply: { type: "boolean", default: false },
    env: { type: "string", default: ".env.local" },
  },
});
config({ path: values.env });

async function main() {
  if (!values.deals || !values.people) throw new Error("Give --deals and --people (the two Pipedrive CSV files)");
  const { planImport, applyImport } = await import("../src/lib/import/pipedrive");
  const plan = planImport(readFileSync(values.deals, "utf8"), readFileSync(values.people, "utf8"));

  const byStage: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const l of plan.leads) {
    byStage[l.stage] = (byStage[l.stage] ?? 0) + 1;
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
  }
  console.log(`Leads to import: ${plan.leads.length}`);
  console.log("By stage:", byStage);
  console.log("By source:", bySource);
  console.log("Deals left out:", plan.skipped);
  console.log("Unmapped values:", plan.unmapped);

  if (!values.apply) {
    console.log("\nDry run: nothing was written. Add --apply to import.");
    return;
  }
  const { db, pool } = await import("../src/db");
  const { studio } = await import("../src/db/schema");
  const [tegen] = await db.select().from(studio).where(eq(studio.slug, "tegen"));
  if (!tegen) throw new Error("No studio with slug tegen in this database");
  const result = await applyImport(db, tegen.id, plan.leads);
  console.log("\nImported:", result);
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
