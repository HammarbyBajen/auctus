import { and, eq, gte, isNull, ne } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { atRiskAlert, handbookCategory, handbookPage, lead, leadEvent, manaMember, manaMembership, person } from "@/db/schema";
import { startOfDayInStockholm } from "@/lib/home/time";
import { getKpi } from "@/lib/kpi/service";
import { customerRole } from "@/lib/mana/membership";
import { listColdReasons, listStages, listWinBackReasons } from "@/lib/pipeline/service";
import { getLeadReport } from "@/lib/reports/service";
import { getMonth } from "@/lib/salary/service";
import { todayInStockholm } from "@/lib/tasks/dates";
import { firstNameOnly, withoutContactDetails } from "./privacy";

/**
 * What the assistant knows when owners ask it something or it writes the
 * weekly summary (ticket 30, phase E): Tegen HQ's own figures, worked out
 * here, never by the AI. Counts and months; people by first name only
 * (decided by Max, 2026-10-23); reasons someone left or went cold as counts,
 * never next to a name; no notes. Handbok's routines are included as text.
 */

type Db = typeof defaultDb;

const DAY = 86_400_000;
/** How much of Handbok goes along: enough for a dozen routines. */
const handbookBudget = 40_000;

const monthOf = (at: Date) => todayInStockholm(at).slice(0, 7);
const monthBefore = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const tally = <K extends string>(keys: K[]) => keys.reduce<Record<string, number>>((out, k) => ({ ...out, [k]: (out[k] ?? 0) + 1 }), {});

/** The Monday a week starts (Stockholm), as a day. */
export function weekStart(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}

export async function buildFacts(db: Db, studioId: string, now: Date = new Date()) {
  const today = todayInStockholm(now);
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const thisWeek = weekStart(today);
  const lastWeekFrom = startOfDayInStockholm(new Date(Date.parse(`${thisWeek}T12:00:00Z`) - 7 * DAY).toISOString().slice(0, 10));
  const lastWeekTo = startOfDayInStockholm(thisWeek);

  const [stages, coldReasons, winBackReasons, { report }, kpi] = await Promise.all([
    listStages(db, studioId, { includeArchived: true }),
    listColdReasons(db, studioId, { includeArchived: true }),
    listWinBackReasons(db, studioId),
    getLeadReport(db, studioId, now),
    getKpi(db, studioId, today),
  ]);
  const stageOf = new Map(stages.map((s) => [s.key, s]));
  const coldName = new Map(coldReasons.map((r) => [r.key, r.name]));
  const winBackName = new Map(winBackReasons.map((r) => [r.key, r.name]));

  // ---- Leads ----
  const leads = await db
    .select({ id: lead.id, source: lead.source, stage: lead.stage, createdAt: lead.createdAt, attribution: lead.attributionParsed, name: person.name })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .where(and(eq(lead.studioId, studioId), gte(lead.createdAt, yearAgo)));
  const kindOf = (stage: string) => stageOf.get(stage)?.kind ?? "open";

  const campaigns = new Map<string, { campaign: string; source: string; leads: number; joined: number; cold: number; open: number }>();
  for (const l of leads) {
    const campaign = l.attribution?.campaign ?? null;
    if (!campaign) continue;
    const key = `${campaign}|${l.attribution?.utmSource ?? ""}`;
    const row = campaigns.get(key) ?? { campaign, source: l.attribution?.utmSource ?? "", leads: 0, joined: 0, cold: 0, open: 0 };
    row.leads += 1;
    const kind = kindOf(l.stage);
    if (kind === "won") row.joined += 1;
    else if (kind === "cold") row.cold += 1;
    else row.open += 1;
    campaigns.set(key, row);
  }

  const events = await db
    .select({ leadId: leadEvent.leadId, toStage: leadEvent.toStage, coldReason: leadEvent.coldReason, at: leadEvent.createdAt })
    .from(leadEvent)
    .where(and(eq(leadEvent.studioId, studioId), eq(leadEvent.type, "stage_changed"), gte(leadEvent.createdAt, yearAgo)));
  const coldByMonth: Record<string, Record<string, number>> = {};
  for (const e of events) {
    if (!e.toStage || kindOf(e.toStage) !== "cold") continue;
    const month = monthOf(e.at);
    const reason = (e.coldReason && coldName.get(e.coldReason)) ?? "okänt";
    coldByMonth[month] = { ...(coldByMonth[month] ?? {}), [reason]: (coldByMonth[month]?.[reason] ?? 0) + 1 };
  }
  const leadName = new Map(leads.map((l) => [l.id, firstNameOnly(l.name)]));
  const sourceOf = new Map(leads.map((l) => [l.id, l.source]));
  const joinedRecently = events
    .filter((e) => e.toStage && kindOf(e.toStage) === "won" && e.at.getTime() >= now.getTime() - 30 * DAY)
    .map((e) => ({ firstName: leadName.get(e.leadId) ?? null, source: sourceOf.get(e.leadId) ?? null, on: todayInStockholm(e.at) }));

  const openByStage = tally(leads.filter((l) => kindOf(l.stage) === "open").map((l) => stageOf.get(l.stage)?.name ?? l.stage));
  const inLastWeek = (at: Date) => at >= lastWeekFrom && at < lastWeekTo;

  // ---- Members ----
  const memberships = await db
    .select({ manaUserId: manaMembership.manaUserId, name: manaMembership.name, kind: manaMembership.pendingChangeKind, date: manaMembership.pendingChangeDate, startDate: manaMembership.startDate, status: manaMembership.status, member: manaMember.name })
    .from(manaMembership)
    .innerJoin(manaMember, and(eq(manaMember.studioId, manaMembership.studioId), eq(manaMember.manaUserId, manaMembership.manaUserId), eq(manaMember.role, customerRole)))
    .where(eq(manaMembership.studioId, studioId));
  const soon = new Date(now.getTime() + 60 * DAY).toISOString().slice(0, 10);
  const leaving = memberships
    .filter((m) => m.kind === "cancel" && m.date && m.date >= today && m.date <= soon)
    .map((m) => ({ firstName: firstNameOnly(m.member), membership: m.name, lastDay: m.date }));
  const pausing = memberships
    .filter((m) => m.kind === "freeze" && m.date && m.date >= today && m.date <= soon)
    .map((m) => ({ firstName: firstNameOnly(m.member), membership: m.name, from: m.date }));
  const startedRecently = memberships
    .filter((m) => m.startDate >= new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10) && m.startDate <= today)
    .map((m) => ({ firstName: firstNameOnly(m.member), membership: m.name, from: m.startDate }));

  const alerts = await db
    .select({ manaUserId: atRiskAlert.manaUserId, lastVisitAt: atRiskAlert.lastVisitAt, member: manaMember.name })
    .from(atRiskAlert)
    .innerJoin(manaMember, and(eq(manaMember.studioId, atRiskAlert.studioId), eq(manaMember.manaUserId, atRiskAlert.manaUserId)))
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.status, "open"), eq(atRiskAlert.cause, "away")));
  // Why people left, paused or did not join, as staff found out (Medlemmar's Avfärda), over the last year.
  const reasons = await db
    .select({ cause: atRiskAlert.cause, reason: atRiskAlert.reason })
    .from(atRiskAlert)
    .where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.status, "dismissed"), ne(atRiskAlert.cause, "away"), gte(atRiskAlert.handledAt, yearAgo)));

  // ---- Timmar: the last three months ----
  const thisMonth = today.slice(0, 7);
  const months = [monthBefore(monthBefore(thisMonth)), monthBefore(thisMonth), thisMonth];
  const hours = [];
  for (const month of months) {
    const { result, lockedAt } = await getMonth(db, studioId, month, now);
    if (!result) continue;
    const counted = new Map(result.types.map((c) => [c.typeKey, c]));
    hours.push({
      month,
      locked: Boolean(lockedAt),
      coaches: result.coaches.map((c) => ({
        firstName: firstNameOnly(c.name),
        hours: c.total,
        byCategory: Object.fromEntries(Object.entries(c.byType).filter(([k]) => counted.get(k)?.counted !== false).map(([k, h]) => [counted.get(k)?.label ?? k, h])),
      })),
    });
  }

  // ---- Handbok ----
  const pages = await db
    .select({ title: handbookPage.title, category: handbookCategory.name, text: handbookPage.text })
    .from(handbookPage)
    .innerJoin(handbookCategory, eq(handbookCategory.id, handbookPage.categoryId))
    .where(and(eq(handbookPage.studioId, studioId), isNull(handbookPage.archivedAt)));
  let budget = handbookBudget;
  const handbook = pages.map((p) => {
    const text = withoutContactDetails(p.text).slice(0, Math.max(0, budget));
    budget -= text.length;
    return { title: p.title, category: p.category, text };
  });

  return {
    today,
    leads: {
      byMonth: report.months.map((m) => ({ month: m.month, total: m.total, bySource: m.bySource, joined: m.won })),
      conversion: report.conversion,
      firstContact: { medianHours: report.contact.medianHours, withinLimitShare: report.contact.withinLimit },
      campaigns: [...campaigns.values()].sort((a, b) => b.leads - a.leads),
      openByStage,
      wentColdByMonthAndReason: coldByMonth,
      joinedLast30Days: joinedRecently,
      lastWeek: {
        newLeads: tally(leads.filter((l) => inLastWeek(l.createdAt)).map((l) => l.source)),
        newLeadNames: leads.filter((l) => inLastWeek(l.createdAt)).map((l) => firstNameOnly(l.name)),
        joined: events.filter((e) => e.toStage && kindOf(e.toStage) === "won" && inLastWeek(e.at)).map((e) => leadName.get(e.leadId) ?? null),
        wentCold: events.filter((e) => e.toStage && kindOf(e.toStage) === "cold" && inLastWeek(e.at)).length,
      },
    },
    members: {
      payingByMonth: (kpi.trend.series[""] ?? []).map((p) => ({ month: p.month, paying: p.count })),
      joinedAndLeftThisMonth: kpi.trend.movement[""] ?? null,
      revenueThisMonthSek: Math.round(kpi.revenue),
      cancellingNext60Days: leaving,
      freezingNext60Days: pausing,
      startedLast30Days: startedRecently,
      whyTheyLeftOrPaused: tally(reasons.filter((r) => r.cause !== "day_pass" && r.cause !== "klippkort" && r.reason).map((r) => winBackName.get(r.reason!) ?? r.reason!)),
      whyDayPassOrKlippkortDidNotJoin: tally(reasons.filter((r) => (r.cause === "day_pass" || r.cause === "klippkort") && r.reason).map((r) => winBackName.get(r.reason!) ?? r.reason!)),
      awayNow: { total: alerts.length, neverCheckedIn: alerts.filter((a) => !a.lastVisitAt).length, firstNames: alerts.map((a) => firstNameOnly(a.member)) },
    },
    hours,
    handbook,
  };
}

export type Facts = Awaited<ReturnType<typeof buildFacts>>;

