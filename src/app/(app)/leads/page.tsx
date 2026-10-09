import Link from "next/link";
import { db } from "@/db";
import { formatDateTime } from "@/lib/format";
import { listLeads } from "@/lib/leads/service";
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
          {leads.map(({ lead, person, stage }) => (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white px-4 py-3"
              >
                <span className="text-lg font-medium">{person.name}</span>
                <span className="text-stone-600">
                  {stage.name} · {t(`source.${lead.source}` as MessageKey)}
                </span>
                <span className="text-sm text-stone-500">
                  {t("leads.createdAt", { when: formatDateTime(lead.createdAt) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
