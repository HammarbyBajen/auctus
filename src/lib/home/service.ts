import { and, count, eq, gte, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/db";
import {
  defaultThresholds,
  lead,
  leadEvent,
  person,
  pipelineStage,
  studioSettings,
  task,
  user,
} from "@/db/schema";
import { todayInStockholm } from "@/lib/tasks/dates";
import { buildAttention, type AttentionItem, type Scope, type Thresholds } from "./attention";
import { startOfMonthInStockholm, startOfWeekInStockholm } from "./time";

type Db = typeof defaultDb;

/** The studio's thresholds, with defaults for anything that is missing. */
export async function getThresholds(db: Db, studioId: string) {
  const [row] = await db
    .select({ thresholds: studioSettings.thresholds })
    .from(studioSettings)
    .where(eq(studioSettings.studioId, studioId))
    .limit(1);
  return { ...defaultThresholds, ...(row?.thresholds ?? {}) };
}

export type HomeCounts = { newThisWeek: number; bookedTests: number; wonThisMonth: number };

export type HomeData = { items: AttentionItem[]; counts: HomeCounts; thresholds: Thresholds };

export async function getHomeData(
  db: Db,
  studioId: string,
  viewerId: string,
  scope: Scope,
  now: Date = new Date(),
): Promise<HomeData> {
  const today = todayInStockholm(now);
  const thresholds = await getThresholds(db, studioId);
  const assignee = alias(user, "assignee");

  const rows = await db
    .select({
      id: lead.id,
      personName: person.name,
      phone: person.phone,
      stage: lead.stage,
      stageKind: pipelineStage.kind,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      assignedToId: lead.assignedToId,
      assigneeName: assignee.name,
    })
    .from(lead)
    .innerJoin(person, eq(person.id, lead.personId))
    .innerJoin(
      pipelineStage,
      and(eq(pipelineStage.studioId, lead.studioId), eq(pipelineStage.key, lead.stage)),
    )
    .leftJoin(assignee, eq(assignee.id, lead.assignedToId))
    .where(and(eq(lead.studioId, studioId), eq(pipelineStage.kind, "open")));

  const leadIds = rows.map((r) => r.id);
  const openTasks = leadIds.length
    ? await db
        .select({ id: task.id, leadId: task.leadId, title: task.title, dueDate: task.dueDate })
        .from(task)
        .where(and(eq(task.studioId, studioId), isNull(task.doneAt), inArray(task.leadId, leadIds)))
    : [];

  const items = buildAttention({
    leads: rows.map((r) => ({ ...r, stageKind: r.stageKind as "open" | "won" | "cold" })),
    tasks: openTasks,
    now,
    today,
    thresholds,
    viewerId,
    scope,
  });

  const weekStart = startOfWeekInStockholm(now);
  const monthStart = startOfMonthInStockholm(now);
  const [[newThisWeek], [bookedTests], [wonThisMonth]] = await Promise.all([
    db
      .select({ n: count() })
      .from(lead)
      .where(and(eq(lead.studioId, studioId), gte(lead.createdAt, weekStart))),
    db
      .select({ n: count() })
      .from(lead)
      .where(and(eq(lead.studioId, studioId), eq(lead.stage, "booked_test_training"))),
    db
      .select({ n: count(leadEvent.leadId) })
      .from(leadEvent)
      .innerJoin(
        pipelineStage,
        and(eq(pipelineStage.studioId, leadEvent.studioId), eq(pipelineStage.key, leadEvent.toStage)),
      )
      .where(
        and(
          eq(leadEvent.studioId, studioId),
          eq(leadEvent.type, "stage_changed"),
          eq(pipelineStage.kind, "won"),
          gte(leadEvent.createdAt, monthStart),
        ),
      ),
  ]);

  return {
    items,
    counts: {
      newThisWeek: newThisWeek.n,
      bookedTests: bookedTests.n,
      wonThisMonth: wonThisMonth.n,
    },
    thresholds,
  };
}
