import { formatDateTime, formatDay, formatNumber } from "@/lib/format";
import { t, type MessageKey } from "@/lib/i18n";

/**
 * What Tegen HQ posts to Discord. Kept pure so the wording is tested. No
 * names, emails or phone numbers: a post says what happened and links to the
 * lead, and the details are read in Tegen HQ.
 */

export const sourceLabel = (source: string) => {
  const key = `source.${source}` as MessageKey;
  const text = t(key);
  return text === undefined ? source : text;
};

export function overdueMessage(input: { source: string; createdAt: Date; deadline: Date; url: string }): string {
  return t("notify.overdue", {
    source: sourceLabel(input.source),
    created: formatDateTime(input.createdAt),
    deadline: formatDateTime(input.deadline),
    url: input.url,
  });
}

export type Summary = {
  /** The day the summary is for (YYYY-MM-DD, Tegen's time). */
  day: string;
  /** Leads that came in the day before, per source. */
  newYesterday: Record<string, number>;
  overdueFirstContact: number;
  tasksOverdue: number;
  tasksToday: number;
  atRisk: number;
  sync: { ok: boolean; at: Date | null };
  url: string;
};

export function summaryMessage(s: Summary): string {
  const newTotal = Object.values(s.newYesterday).reduce((n, v) => n + v, 0);
  const bySource = Object.entries(s.newYesterday)
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${sourceLabel(source)} ${formatNumber(n)}`)
    .join(", ");
  const lines = [
    t("notify.summary.title", { day: formatDay(s.day) }),
    `• ${newTotal > 0 ? t("notify.summary.newLeads", { n: formatNumber(newTotal), sources: bySource }) : t("notify.summary.noNewLeads")}`,
    `• ${t("notify.summary.overdue", { n: formatNumber(s.overdueFirstContact) })}`,
    `• ${t("notify.summary.tasks", { overdue: formatNumber(s.tasksOverdue), today: formatNumber(s.tasksToday) })}`,
    `• ${t("notify.summary.atRisk", { n: formatNumber(s.atRisk) })}`,
    `• ${
      s.sync.at === null
        ? t("notify.summary.syncNever")
        : s.sync.ok
          ? t("notify.summary.syncOk", { when: formatDateTime(s.sync.at) })
          : t("notify.summary.syncFailed", { when: formatDateTime(s.sync.at) })
    }`,
    s.url,
  ];
  return lines.join("\n");
}
