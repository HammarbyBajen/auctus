import { and, eq, gte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { lead, leadEvent, pipelineStage } from "@/db/schema";
import { getThresholds } from "@/lib/home/service";
import { startOfDayInStockholm } from "@/lib/home/time";
import { initialStage } from "@/lib/leads/constants";
import { todayInStockholm } from "@/lib/tasks/dates";
import { buildLeadReport, lastMonths, type ReportLead } from "./leads";

type Db = typeof defaultDb;

/**
 * The lead report for the last twelve months (ticket 16). Won is the first
 * move to a Won stage (a person's or Mana's). A first contact is a person's:
 * a logged call or email, or moving the lead out of the first stage; what
 * the CRM does by itself (an automatic Won) is not one.
 */
export async function getLeadReport(db: Db, studioId: string, now: Date = new Date(), monthCount = 12) {
  const today = todayInStockholm(now);
  const from = startOfDayInStockholm(`${lastMonths(today, monthCount)[0]}-01`);

  const wonAt = db
    .select({ leadId: leadEvent.leadId, at: sql<Date>`min(${leadEvent.createdAt})`.mapWith(leadEvent.createdAt).as("won_at") })
    .from(leadEvent)
    .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, leadEvent.studioId), eq(pipelineStage.key, leadEvent.toStage)))
    .where(and(eq(leadEvent.studioId, studioId), eq(leadEvent.type, "stage_changed"), eq(pipelineStage.kind, "won")))
    .groupBy(leadEvent.leadId)
    .as("won");
  const contactAt = db
    .select({ leadId: leadEvent.leadId, at: sql<Date>`min(${leadEvent.createdAt})`.mapWith(leadEvent.createdAt).as("contact_at") })
    .from(leadEvent)
    .where(
      and(
        eq(leadEvent.studioId, studioId),
        sql`${leadEvent.via} is null`,
        sql`(${leadEvent.type} = 'contact_logged' or (${leadEvent.type} = 'stage_changed' and ${leadEvent.fromStage} = ${initialStage}))`,
      ),
    )
    .groupBy(leadEvent.leadId)
    .as("contact");

  const rows = await db
    .select({
      source: lead.source,
      createdAt: lead.createdAt,
      imported: sql<boolean>`${lead.externalRef} is not null`,
      wonAt: wonAt.at,
      firstContactAt: contactAt.at,
    })
    .from(lead)
    .leftJoin(wonAt, eq(wonAt.leadId, lead.id))
    .leftJoin(contactAt, eq(contactAt.leadId, lead.id))
    .where(and(eq(lead.studioId, studioId), gte(lead.createdAt, from)));

  const leads: ReportLead[] = rows.map((r) => ({
    source: r.source,
    createdAt: r.createdAt,
    imported: r.imported,
    wonAt: r.wonAt,
    firstContactAt: r.firstContactAt,
  }));
  const thresholds = await getThresholds(db, studioId);
  return { report: buildLeadReport(leads, today, thresholds, monthCount), firstContactHours: thresholds.firstContactHours };
}
