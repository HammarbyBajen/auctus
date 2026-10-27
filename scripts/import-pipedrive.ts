/**
 * Imports open leads from a Pipedrive export (ticket 15). A dry run unless
 * --apply is given. Prints counts only, never names or contact details.
 * With --replace, every lead from an earlier import goes first (in the same
 * transaction), so stages match the new export. A replace refuses when staff
 * have worked on any imported lead (that work would go), unless --force.
 *
 *   pnpm import:pipedrive --deals deals.csv --people people.csv [--replace [--force]] [--apply] [--env .env.production.local]
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
    replace: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    env: { type: "string", default: ".env.local" },
  },
});
config({ path: values.env });

async function main() {
  if (!values.deals || !values.people) throw new Error("Give --deals and --people (the two Pipedrive CSV files)");
  const { planImport, applyImport, previewReplace, replaceImport } = await import("../src/lib/import/pipedrive");
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

  const { db, pool } = await import("../src/db");
  const { studio } = await import("../src/db/schema");
  const [tegen] = await db.select().from(studio).where(eq(studio.slug, "tegen"));
  if (!tegen) throw new Error("No studio with slug tegen in this database");
  if (values.replace) {
    const removes = await previewReplace(db, tegen.id);
    console.log("Replacing the earlier import, removes:", removes);
    if (removes.worked > 0) console.log(`Warning: ${removes.worked} imported leads have been worked on in Tegen HQ; a replace would delete that work${values.force ? " (--force given)" : " and is refused without --force"}.`);
  }

  if (!values.apply) {
    console.log("\nDry run: nothing was written. Add --apply to import.");
  } else if (values.replace) {
    console.log("\nReplaced:", await replaceImport(db, tegen.id, plan.leads, { force: values.force }));
  } else {
    console.log("\nImported:", await applyImport(db, tegen.id, plan.leads));
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
