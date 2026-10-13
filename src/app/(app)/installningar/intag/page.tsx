import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Inbox } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { formatDateTime } from "@/lib/format";
import { recentSubmissions } from "@/lib/intake/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Leads from the website (ticket 09): the address tegen-web sends to, whether
 * the shared secret is set (never the secret itself), and the latest
 * submissions, so a test from Erik can be seen to arrive.
 */
export default async function IntakePage() {
  const owner = await requirePermission("settings", "manage");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/leads/intake`;
  const configured = Boolean(process.env.LEAD_INTAKE_SECRET);
  const submissions = await recentSubmissions(db, owner.studioId);

  return (
    <Page
      title={t("intake.title")}
      description={t("intake.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      <Panel title={t("intake.connectionTitle")} id="connection">
        <dl className="grid gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{t("intake.address")}</dt>
            <dd className="font-mono text-xs break-all">POST {endpoint}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{t("intake.secret")}</dt>
            <dd>{configured ? t("intake.secretSet") : t("intake.secretMissing")}</dd>
          </div>
        </dl>
        {!configured && <Notice tone="warning">{t("intake.secretWarning")}</Notice>}
        <p className="text-xs text-muted-foreground">{t("intake.docs")}</p>
      </Panel>

      <Panel title={t("intake.recentTitle")} id="recent">
        {submissions.length === 0 ? (
          <EmptyState icon={Inbox} title={t("intake.none")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0">
                  {s.leadId && s.name ? (
                    <Link href={`/leads/${s.leadId}`} className="focus-ring rounded-xs font-medium underline-offset-4 hover:underline">
                      {s.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t("intake.noLead")}</span>
                  )}
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(s.receivedAt)} · {t(`intake.route.${s.route}` as MessageKey)}
                  </span>
                </span>
                <Chip tone={s.outcome === "created" ? "success" : s.outcome === "test" ? "neutral" : "warning"}>
                  {t(`intake.outcome.${s.outcome}` as MessageKey)}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
