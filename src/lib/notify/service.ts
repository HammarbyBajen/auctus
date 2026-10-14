import { and, count, eq, gte, lt } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { atRiskAlert, discordNotice, lead } from "@/db/schema";
import { addRunningHours } from "@/lib/home/clock";
import { getHomeData, getThresholds } from "@/lib/home/service";
import { startOfDayInStockholm } from "@/lib/home/time";
import { initialStage } from "@/lib/leads/constants";
import { getSyncStatus } from "@/lib/mana/status";
import { todayInStockholm } from "@/lib/tasks/dates";
import { appUrl, postToDiscord, type PostResult } from "./discord";
import { overdueMessage, summaryMessage, type Summary } from "./messages";

type Db = typeof defaultDb;
type Post = (content: string) => Promise<PostResult>;

/**
 * Posts something once. The key is claimed first, so a retried step or a
 * second cron call finds it taken and posts nothing. If the post fails the
 * claim is let go, so the next try can post it.
 */
export async function postOnce(db: Db, studioId: string, key: string, content: string, post: Post = postToDiscord): Promise<PostResult | "already_sent"> {
  const [claim] = await db.insert(discordNotice).values({ studioId, key }).onConflictDoNothing().returning({ key: discordNotice.key });
  if (!claim) return "already_sent";
  const result = await post(content);
  if (result !== "sent") await db.delete(discordNotice).where(and(eq(discordNotice.studioId, studioId), eq(discordNotice.key, key)));
  return result;
}

export type FirstContact =
  | { state: "done" }
  | { state: "waiting"; until: string }
  | { state: "overdue"; source: string; createdAt: string; deadline: string };

/**
 * Where a lead stands on its first contact: done (it has left the first
 * stage, or is gone), waiting until its deadline, or overdue. The deadline
 * follows the studio's settings as they are now (Tidsgränser), so a changed
 * limit or a day off moves it.
 */
export async function firstContactState(db: Db, studioId: string, leadId: string, now: Date = new Date()): Promise<FirstContact> {
  const [row] = await db
    .select({ stage: lead.stage, createdAt: lead.createdAt, source: lead.source })
    .from(lead)
    .where(and(eq(lead.studioId, studioId), eq(lead.id, leadId)))
    .limit(1);
  if (!row || row.stage !== initialStage) return { state: "done" };
  const thresholds = await getThresholds(db, studioId);
  const deadline = addRunningHours(row.createdAt, thresholds.firstContactHours, thresholds);
  // No days chosen for the clock means no deadline, so nothing is ever late.
  if (!deadline) return { state: "done" };
  if (deadline > now) return { state: "waiting", until: deadline.toISOString() };
  return { state: "overdue", source: row.source, createdAt: row.createdAt.toISOString(), deadline: deadline.toISOString() };
}

/** Posts that a lead missed its first-contact deadline, once per lead. */
export async function notifyOverdue(db: Db, studioId: string, leadId: string, now: Date = new Date(), post: Post = postToDiscord) {
  const state = await firstContactState(db, studioId, leadId, now);
  if (state.state !== "overdue") return state.state;
  const content = overdueMessage({
    source: state.source,
    createdAt: new Date(state.createdAt),
    deadline: new Date(state.deadline),
    url: `${appUrl()}/leads/${leadId}`,
  });
  return postOnce(db, studioId, `overdue:${leadId}`, content, post);
}

/** The morning figures: yesterday's new leads, what is overdue, tasks, at-risk members and the Mana sync. */
export async function buildSummary(db: Db, studioId: string, now: Date = new Date()): Promise<Summary> {
  const day = todayInStockholm(now);
  const yesterdayStart = startOfDayInStockholm(todayInStockholm(new Date(startOfDayInStockholm(day).getTime() - 12 * 3_600_000)));
  const todayStart = startOfDayInStockholm(day);

  const [newRows, home, [risk], sync] = await Promise.all([
    db
      .select({ source: lead.source, n: count() })
      .from(lead)
      .where(and(eq(lead.studioId, studioId), gte(lead.createdAt, yesterdayStart), lt(lead.createdAt, todayStart)))
      .groupBy(lead.source),
    // Everyone's view: the summary is for the studio, not one person.
    getHomeData(db, studioId, "", "all", now),
    db.select({ n: count() }).from(atRiskAlert).where(and(eq(atRiskAlert.studioId, studioId), eq(atRiskAlert.status, "open"))),
    getSyncStatus(db, studioId),
  ]);

  const reasons = home.items.flatMap((i) => i.reasons);
  return {
    day,
    newYesterday: Object.fromEntries(newRows.map((r) => [r.source, r.n])),
    overdueFirstContact: reasons.filter((r) => r.type === "first_contact_overdue").length,
    tasksOverdue: reasons.filter((r) => r.type === "task_overdue").length,
    tasksToday: reasons.filter((r) => r.type === "task_today").length,
    atRisk: risk.n,
    sync: sync.failure ? { ok: false, at: sync.failure.at } : { ok: true, at: sync.lastSuccessAt },
    url: `${appUrl()}/`,
  };
}

/** Posts the morning summary, once per day. */
export async function postDailySummary(db: Db, studioId: string, now: Date = new Date(), post: Post = postToDiscord) {
  const summary = await buildSummary(db, studioId, now);
  return postOnce(db, studioId, `summary:${summary.day}`, summaryMessage(summary), post);
}
