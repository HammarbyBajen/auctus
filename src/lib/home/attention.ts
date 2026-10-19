import { initialStage, isWinBackSource } from "@/lib/leads/constants";
import type { StageKind } from "@/lib/pipeline/defaults";
import { dueState } from "@/lib/tasks/dates";
import { addRunningHours, type Clock } from "./clock";

export type Thresholds = Clock & {
  firstContactHours: number;
  warnHoursBeforeDeadline: number;
  /** Days without activity before a lead is stalled, for a stage with no limit of its own. */
  stalledDays: number;
  /** Each open stage's own limit, by stage key (ticket 29). */
  stalledDaysByStage?: Record<string, number>;
};

export type AttentionLead = {
  id: string;
  personName: string;
  phone: string | null;
  stage: string;
  stageKind: StageKind;
  /** The stage's place in the pipeline: a later stage is closer to joining. */
  stagePosition?: number;
  createdAt: Date;
  updatedAt: Date;
  assignedToId: string | null;
  assigneeName: string | null;
  source?: string;
  winBackReason?: string | null;
};

export type AttentionTask = { id: string; leadId: string; title: string; dueDate: string };

/** Why a lead needs attention. A lead can have several reasons. */
export type Reason =
  | { type: "first_contact_overdue"; msOver: number }
  | { type: "first_contact_soon"; msLeft: number }
  | { type: "first_contact_ok"; msLeft: number }
  | { type: "task_overdue"; title: string; dueDate: string }
  | { type: "task_today"; title: string }
  | { type: "stalled"; days: number }
  | { type: "win_back"; source: string };

export type Severity = "red" | "amber" | "normal";

/**
 * now: a deadline (first contact, a task due today or earlier). later: a lead
 * without a next step, shown quieter below (ticket 29).
 */
export type AttentionGroup = "now" | "later";

export type AttentionItem = {
  lead: AttentionLead;
  reasons: Reason[];
  severity: Severity;
  group: AttentionGroup;
};

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Lower rank means more urgent. Ties are broken by how far past (or close to) the limit it is. */
function rankOf(reason: Reason): { rank: number; magnitude: number } {
  switch (reason.type) {
    case "first_contact_overdue":
      return { rank: 1, magnitude: reason.msOver };
    case "task_overdue":
      return { rank: 2, magnitude: 0 };
    case "first_contact_soon":
      return { rank: 3, magnitude: -reason.msLeft };
    case "task_today":
      return { rank: 4, magnitude: 0 };
    case "stalled":
      return { rank: 5, magnitude: reason.days };
    case "win_back":
      return { rank: 5, magnitude: 0 };
    case "first_contact_ok":
      return { rank: 6, magnitude: -reason.msLeft };
  }
}

const nowReasons = new Set<Reason["type"]>(["first_contact_overdue", "first_contact_soon", "first_contact_ok", "task_overdue", "task_today"]);

function severityOf(reasons: Reason[]): Severity {
  if (reasons.some((r) => r.type === "first_contact_overdue" || r.type === "task_overdue")) return "red";
  if (reasons.some((r) => r.type === "first_contact_soon" || r.type === "task_today")) return "amber";
  return "normal";
}

export type Scope = "mine" | "all";

/**
 * Works out which leads need attention and in what order.
 *
 * - A lead still in the first stage has not been contacted: it has
 *   `firstContactHours` from when it arrived. Amber when `warnHoursBeforeDeadline`
 *   or less remain, red when the time has passed.
 * - Open tasks due today or earlier are listed (overdue ones in red).
 * - A lead past the first stage with no activity for its stage's limit (or
 *   `stalledDays` when the stage has none) and no open task at all is stalled.
 *   A lead with an open task counts as handled, which is how a lead is parked
 *   ("Vänta till" makes a dated task).
 * - Deadlines go in the "now" group, in order of urgency. Leads without a next
 *   step go in the "later" group, closest to joining first, then newest.
 * - Won and cold leads never appear.
 * - Scope "mine" keeps leads that are mine or nobody's. "all" keeps everything.
 */
export function buildAttention(input: {
  leads: AttentionLead[];
  tasks: AttentionTask[];
  now: Date;
  today: string;
  thresholds: Thresholds;
  viewerId: string;
  scope: Scope;
}): AttentionItem[] {
  const { leads, tasks, now, today, thresholds, viewerId, scope } = input;
  const tasksByLead = new Map<string, AttentionTask[]>();
  for (const task of tasks) tasksByLead.set(task.leadId, [...(tasksByLead.get(task.leadId) ?? []), task]);

  const items: AttentionItem[] = [];
  for (const lead of leads) {
    if (lead.stageKind !== "open") continue;
    if (scope === "mine" && lead.assignedToId && lead.assignedToId !== viewerId) continue;

    const reasons: Reason[] = [];
    const openTasks = tasksByLead.get(lead.id) ?? [];

    // The first-contact promise counts only the days the clock runs (ticket 06).
    const deadline = lead.stage === initialStage ? addRunningHours(lead.createdAt, thresholds.firstContactHours, thresholds) : null;
    if (deadline) {
      const msLeft = deadline.getTime() - now.getTime();
      if (msLeft < 0) reasons.push({ type: "first_contact_overdue", msOver: -msLeft });
      else if (msLeft <= thresholds.warnHoursBeforeDeadline * HOUR) reasons.push({ type: "first_contact_soon", msLeft });
      else reasons.push({ type: "first_contact_ok", msLeft });
    }

    for (const task of openTasks) {
      const state = dueState(task.dueDate, today);
      if (state === "overdue") reasons.push({ type: "task_overdue", title: task.title, dueDate: task.dueDate });
      else if (state === "today") reasons.push({ type: "task_today", title: task.title });
    }

    if (lead.stage !== initialStage && openTasks.length === 0) {
      const idleMs = now.getTime() - lead.updatedAt.getTime();
      const limit = thresholds.stalledDaysByStage?.[lead.stage] ?? thresholds.stalledDays;
      if (idleMs >= limit * DAY) {
        reasons.push({ type: "stalled", days: Math.floor(idleMs / DAY) });
      }
    }

    // A win-back lead whose reason is still unknown needs someone to find out why.
    if (lead.source && isWinBackSource(lead.source) && !lead.winBackReason) {
      reasons.push({ type: "win_back", source: lead.source });
    }

    if (reasons.length > 0) {
      const group = reasons.some((r) => nowReasons.has(r.type)) ? "now" : "later";
      items.push({ lead, reasons, severity: severityOf(reasons), group });
    }
  }

  const best = (item: AttentionItem) =>
    item.reasons.map(rankOf).reduce((a, b) => (b.rank < a.rank || (b.rank === a.rank && b.magnitude > a.magnitude) ? b : a));

  return items.sort((a, b) => {
    if (a.group !== b.group) return a.group === "now" ? -1 : 1;
    if (a.group === "later") {
      // Nothing is due here, so the warmest lead goes first: closest to joining, then newest.
      const stage = (b.lead.stagePosition ?? 0) - (a.lead.stagePosition ?? 0);
      if (stage !== 0) return stage;
      return b.lead.createdAt.getTime() - a.lead.createdAt.getTime();
    }
    const x = best(a);
    const y = best(b);
    if (x.rank !== y.rank) return x.rank - y.rank;
    if (x.magnitude !== y.magnitude) return y.magnitude - x.magnitude;
    return a.lead.createdAt.getTime() - b.lead.createdAt.getTime();
  });
}

/** "3 tim", "40 min", "2 dagar": a short span for the page. */
export function formatSpan(ms: number): { unit: "minutes" | "hours" | "days"; value: number } {
  const abs = Math.abs(ms);
  if (abs < HOUR) return { unit: "minutes", value: Math.max(1, Math.round(abs / 60_000)) };
  if (abs < 2 * DAY) return { unit: "hours", value: Math.round(abs / HOUR) };
  return { unit: "days", value: Math.round(abs / DAY) };
}
