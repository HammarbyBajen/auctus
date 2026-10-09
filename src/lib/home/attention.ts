import { initialStage } from "@/lib/leads/constants";
import type { StageKind } from "@/lib/pipeline/defaults";
import { dueState } from "@/lib/tasks/dates";

export type Thresholds = {
  firstContactHours: number;
  warnHoursBeforeDeadline: number;
  stalledDays: number;
};

export type AttentionLead = {
  id: string;
  personName: string;
  phone: string | null;
  stage: string;
  stageKind: StageKind;
  createdAt: Date;
  updatedAt: Date;
  assignedToId: string | null;
  assigneeName: string | null;
};

export type AttentionTask = { id: string; leadId: string; title: string; dueDate: string };

/** Why a lead needs attention. A lead can have several reasons. */
export type Reason =
  | { type: "first_contact_overdue"; msOver: number }
  | { type: "first_contact_soon"; msLeft: number }
  | { type: "first_contact_ok"; msLeft: number }
  | { type: "task_overdue"; title: string; dueDate: string }
  | { type: "task_today"; title: string }
  | { type: "stalled"; days: number };

export type Severity = "red" | "amber" | "normal";

export type AttentionItem = {
  lead: AttentionLead;
  reasons: Reason[];
  severity: Severity;
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
    case "first_contact_ok":
      return { rank: 6, magnitude: -reason.msLeft };
  }
}

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
 * - A lead past the first stage with no activity for `stalledDays` and no open
 *   task at all is stalled. A lead with an open task counts as handled.
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

    if (lead.stage === initialStage) {
      const msLeft = lead.createdAt.getTime() + thresholds.firstContactHours * HOUR - now.getTime();
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
      if (idleMs >= thresholds.stalledDays * DAY) {
        reasons.push({ type: "stalled", days: Math.floor(idleMs / DAY) });
      }
    }

    if (reasons.length > 0) items.push({ lead, reasons, severity: severityOf(reasons) });
  }

  const best = (item: AttentionItem) =>
    item.reasons.map(rankOf).reduce((a, b) => (b.rank < a.rank || (b.rank === a.rank && b.magnitude > a.magnitude) ? b : a));

  return items.sort((a, b) => {
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
