import Link from "next/link";
import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { listLeads } from "@/lib/leads/service";
import { isGreyedOut } from "@/lib/tasks/dates";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";

export default async function LeadsPage() {
  const user = await requirePermission("leads", "read");
  const leads = await listLeads(db, user.studioId);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("leads.title")}</h1>
        <Link href="/leads/ny" className="rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white">
          {t("leads.new")}
        </Link>
      </div>
      {leads.length === 0 ? (
        <p className="text-lg text-stone-700">{t("leads.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map(({ lead, person, stage, assigneeName, openTasks, overdueTasks }) => {
            const greyed = isGreyedOut(lead.assignedToId, user.id);
            return (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className={`flex flex-col gap-1 rounded-lg border px-4 py-3 ${
                  greyed ? "border-stone-200 bg-stone-100 text-stone-500" : "border-stone-200 bg-white"
                }`}
              >
                <span className="text-lg font-medium">{person.name}</span>
                <span className="text-stone-600">
                  {stage.name} · {t(`source.${lead.source}` as MessageKey)}
                </span>
                {assigneeName && <span className="text-sm">{t("assign.assignedTo", { name: assigneeName })}</span>}
                {overdueTasks > 0 ? (
                  <span className="font-semibold text-red-700">
                    {t(overdueTasks === 1 ? "leads.overdueTasks" : "leads.overdueTasksMany", {
                      count: String(overdueTasks),
                    })}
                  </span>
                ) : openTasks > 0 ? (
                  <span className="text-sm">
                    {t(openTasks === 1 ? "leads.openTasks" : "leads.openTasksMany", { count: String(openTasks) })}
                  </span>
                ) : null}
                <span className="text-sm text-stone-500">
                  {t("leads.createdAt", { when: formatDateTime(lead.createdAt) })}
                </span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
