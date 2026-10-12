import { and, desc, eq, gte, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/db";
import { lead, person, pipelineStage, user } from "@/db/schema";
import { normalizePhone } from "./matching";

type Db = typeof defaultDb;

/** How far back the period filter reaches, in days. */
export const periods = { "7": 7, "30": 30, "90": 90, "365": 365 } as const;
export type Period = keyof typeof periods;

/**
 * Search and filters for the leads page, as they appear in the address
 * (`?q=anna&fas=cold&kalla=chat_bot&ansvarig=mina&period=30`), so a view can
 * be shared and reloaded. Empty means "any". (`steg` is taken: it picks the
 * stage tab on a phone and the cold view.)
 */
export type LeadFilters = {
  q: string;
  stage: string;
  source: string;
  /** "mine", "none", a user id, or "" for anyone */
  assignee: string;
  period: Period | "";
};

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function parseLeadFilters(params: Params): LeadFilters {
  const period = one(params.period);
  const assignee = one(params.ansvarig);
  return {
    q: one(params.q).slice(0, 100),
    stage: one(params.fas),
    source: one(params.kalla),
    assignee: assignee === "mina" ? "mine" : assignee === "ingen" ? "none" : assignee,
    period: period in periods ? (period as Period) : "",
  };
}

/** True when the visitor searched or filtered, so the page shows results instead of the board. */
export function isFiltering(f: LeadFilters): boolean {
  return Boolean(f.q || f.stage || f.source || f.assignee || f.period);
}

/** The address for a set of filters, leaving out the empty ones. */
export function filtersToSearch(f: LeadFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.stage) params.set("fas", f.stage);
  if (f.source) params.set("kalla", f.source);
  if (f.assignee) params.set("ansvarig", f.assignee === "mine" ? "mina" : f.assignee === "none" ? "ingen" : f.assignee);
  if (f.period) params.set("period", f.period);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** A LIKE pattern that matches the text anywhere, with the text's own % and _ taken literally. */
function contains(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Case-insensitive "contains" that also folds Å/å, Ä/ä and Ö/ö whatever the
 * database's own locale is (a plain "C" database does not), using ICU's rules.
 */
function containsIgnoringCase(column: AnyColumn, text: string): SQL {
  return sql`lower(${column} collate "und-x-icu") like lower(${contains(text)}::text collate "und-x-icu")`;
}

/**
 * The phone digits to look for: what was typed, without spaces or dashes, and
 * a +46 number in the national form the database keeps (0701234567). Partial
 * numbers work, so "1234567" finds 070-123 45 67. Null when too few digits.
 */
export function phoneNeedle(q: string): string | null {
  const digits = q.replace(/\D/g, "");
  if (digits.length < 3) return null;
  if (/^\s*(\+|00)46/.test(q)) return normalizePhone(q) ?? digits;
  return digits;
}

/**
 * Leads matching the search and filters, across every stage (members and cold
 * leads too, so anyone can be found), newest first. Name and email match
 * anywhere, ignoring case; phone matches on its digits.
 */
export async function searchLeads(db: Db, studioId: string, f: LeadFilters, viewerId: string, now: Date = new Date()) {
  const assignee = alias(user, "assignee");
  const where: (SQL | undefined)[] = [eq(lead.studioId, studioId)];

  if (f.q) {
    const needle = phoneNeedle(f.q);
    where.push(
      or(
        containsIgnoringCase(person.name, f.q),
        containsIgnoringCase(person.email, f.q),
        needle ? sql`${person.phoneNormalized} like ${contains(needle)}` : undefined,
      ),
    );
  }
  if (f.stage) where.push(eq(lead.stage, f.stage));
  if (f.source) where.push(eq(lead.source, f.source));
  if (f.assignee === "mine") where.push(eq(lead.assignedToId, viewerId));
  else if (f.assignee === "none") where.push(isNull(lead.assignedToId));
  else if (f.assignee) where.push(eq(lead.assignedToId, f.assignee));
  if (f.period) where.push(gte(lead.createdAt, new Date(now.getTime() - periods[f.period] * 86_400_000)));

  return db
    .select({ lead, person, stage: pipelineStage, assigneeName: assignee.name })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(pipelineStage, and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)))
    .leftJoin(assignee, eq(assignee.id, lead.assignedToId))
    .where(and(...where))
    .orderBy(desc(lead.createdAt));
}

/** The sources the studio's leads actually have, for the source filter. */
export async function usedSources(db: Db, studioId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ source: lead.source })
    .from(lead)
    .where(eq(lead.studioId, studioId))
    .orderBy(sql`1`);
  return rows.map((r) => r.source);
}
