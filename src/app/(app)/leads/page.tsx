import Link from "next/link";
import { AlertCircle, Plus } from "lucide-react";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { StageBadge } from "@/components/app/stage-badge";
import { formatDateTime } from "@/lib/format";
import { listLeads } from "@/lib/leads/service";
import { isGreyedOut } from "@/lib/tasks/dates";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";

function TaskSummary({ open, overdue }: { open: number; overdue: number }) {
  if (overdue > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-danger-text">
        <AlertCircle aria-hidden="true" className="size-4" />
        {t(overdue === 1 ? "leads.overdueTasks" : "leads.overdueTasksMany", { count: String(overdue) })}
      </span>
    );
  }
  if (open > 0) return <span>{t(open === 1 ? "leads.openTasks" : "leads.openTasksMany", { count: String(open) })}</span>;
  return <span className="text-muted-foreground">–</span>;
}

export default async function LeadsPage() {
  const user = await requirePermission("leads", "read");
  const leads = await listLeads(db, user.studioId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("leads.title")}>
        <Button asChild className="hidden md:inline-flex">
          <Link href="/leads/ny">
            <Plus aria-hidden="true" />
            {t("leads.new")}
          </Link>
        </Button>
      </PageHeader>

      {leads.length === 0 ? (
        <Notice>{t("leads.empty")}</Notice>
      ) : (
        <>
          <p className="text-sm text-muted-foreground tabular-nums">{t("leads.count", { n: String(leads.length) })}</p>

          {/* Phone: one card per lead */}
          <ul className="flex flex-col gap-3 md:hidden">
            {leads.map(({ lead, person, stage, assigneeName, openTasks, overdueTasks }) => (
              <li key={lead.id} className="[contain-intrinsic-size:auto_7rem] [content-visibility:auto]">
                <Link
                  href={`/leads/${lead.id}`}
                  className={cn(
                    "flex flex-col gap-2 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
                    isGreyedOut(lead.assignedToId, user.id) && "opacity-60",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 text-lg font-medium break-words">{person.name}</span>
                    <StageBadge name={stage.name} kind={stage.kind} />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`source.${lead.source}` as MessageKey)} · <span className="tabular-nums">{formatDateTime(lead.createdAt)}</span>
                  </span>
                  {assigneeName && <span className="text-sm text-muted-foreground">{t("assign.assignedTo", { name: assigneeName })}</span>}
                  {(openTasks > 0 || overdueTasks > 0) && (
                    <span className="text-sm">
                      <TaskSummary open={openTasks} overdue={overdueTasks} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet and desktop: a table to scan */}
          <div className="hidden overflow-x-auto rounded-md border border-border bg-card md:block">
            <table className="w-full text-left text-base">
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  {(["leads.colName", "leads.colStage", "leads.colSource", "leads.colAssignee", "leads.colTasks", "leads.colCreated"] as const).map((key) => (
                    <th key={key} scope="col" className="label-caps px-4 py-3 text-sm font-normal text-muted-foreground">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(({ lead, person, stage, assigneeName, openTasks, overdueTasks }) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      "border-b border-border [contain-intrinsic-size:auto_3.5rem] [content-visibility:auto] last:border-0 hover:bg-accent/60",
                      isGreyedOut(lead.assignedToId, user.id) && "opacity-60",
                    )}
                  >
                    <td className="max-w-64 px-4 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="block truncate font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                      >
                        {person.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge name={stage.name} kind={stage.kind} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t(`source.${lead.source}` as MessageKey)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{assigneeName ?? "–"}</td>
                    <td className="px-4 py-3 text-sm">
                      <TaskSummary open={openTasks} overdue={overdueTasks} />
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatDateTime(lead.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
