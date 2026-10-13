import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { formatDateTime, formatDay, formatNumber } from "@/lib/format";
import { recentDeletions, reviewAfterMonths, staleColdLeads } from "@/lib/privacy/service";
import { requirePermission } from "@/lib/session";
import { todayInStockholm } from "@/lib/tasks/dates";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Privacy (ticket 17): cold leads that have been untouched for 24 months, for
 * an owner to review one by one, and a record of deletions made. Nothing is
 * deleted from here without opening the person and confirming.
 */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ raderad?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { raderad } = await searchParams;
  const [stale, deletions] = await Promise.all([staleColdLeads(db, user.studioId), recentDeletions(db, user.studioId)]);

  return (
    <Page
      title={t("privacy.title")}
      description={t("privacy.intro", { months: String(reviewAfterMonths) })}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {raderad === "1" && <Notice tone="success">{t("privacy.deleted")}</Notice>}
      <Panel title={t("privacy.reviewTitle", { n: formatNumber(stale.length) })} id="review">
        {stale.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t("privacy.reviewEmpty", { months: String(reviewAfterMonths) })} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {stale.map((row) => (
              <li key={row.leadId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/leads/${row.leadId}`} className="focus-ring rounded-xs text-sm font-medium underline-offset-4 hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{t("privacy.lastActivity", { date: formatDay(todayInStockholm(row.lastActivity)) })}</p>
                </div>
                <ButtonLink href={`/leads/${row.leadId}/radera?fran=integritet`} variant="outline" size="sm" className="self-start sm:self-auto">
                  {t("privacy.review")}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t("privacy.logTitle")} id="log">
        {deletions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("privacy.logEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {deletions.map((d) => (
              <li key={d.id} className="tabular-nums">
                {t("privacy.logRow", { when: formatDateTime(d.deletedAt), leads: formatNumber(d.leads), notes: formatNumber(d.notes), tasks: formatNumber(d.tasks) })}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
