import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader } from "lucide-react";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/app/notice";
import { PageHeader } from "@/components/app/page-header";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime } from "@/lib/format";
import { getAddOnMembershipIds, getIgnoredMembershipIds, listMembershipKinds } from "@/lib/mana/leads";
import { getSyncStatus } from "@/lib/mana/status";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { saveMembershipRules, saveWinBackSetting, syncNow } from "./actions";

export const dynamic = "force-dynamic";

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="label-caps text-lg">{title}</h2>
        </CardTitle>
        {description && <CardDescription className="text-base">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export default async function ManaPage({
  searchParams,
}: {
  searchParams: Promise<{ startad?: string; sparat?: string; vinnsparat?: string }>;
}) {
  const user = await requirePermission("settings", "manage");
  const { startad, sparat, vinnsparat } = await searchParams;
  const [status, kinds, ignored, addOns, [settings]] = await Promise.all([
    getSyncStatus(db, user.studioId),
    listMembershipKinds(db, user.studioId),
    getIgnoredMembershipIds(db, user.studioId),
    getAddOnMembershipIds(db, user.studioId),
    db
      .select({ winBackEnabled: studioSettings.winBackEnabled })
      .from(studioSettings)
      .where(eq(studioSettings.studioId, user.studioId))
      .limit(1),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/installningar"
        className="label-caps inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("settings.title")}
      </Link>
      <PageHeader title={t("mana.title")} />
      <p className="text-muted-foreground">{t("mana.intro")}</p>
      {!status.configured && <Notice tone="warning">{t("mana.notConfigured")}</Notice>}
      {startad === "1" && <Notice>{t("mana.started")}</Notice>}

      <SectionCard title={t("mana.lastSuccess")}>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-sm text-muted-foreground">{t("mana.lastSuccess")}</dt>
            <dd className="font-medium tabular-nums">{status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : t("mana.never")}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("mana.members")}</dt>
            <dd className="heading-display text-2xl tabular-nums">{status.members}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("mana.memberships")}</dt>
            <dd className="heading-display text-2xl tabular-nums">{status.memberships}</dd>
          </div>
        </dl>
        <form action={syncNow}>
          <SubmitButton disabled={!status.configured || Boolean(status.running)} pendingLabel={t("mana.syncing")}>
            {status.running ? t("mana.syncing") : t("mana.syncNow")}
          </SubmitButton>
        </form>
      </SectionCard>

      <SectionCard title={t("mana.winbackTitle")} description={t("mana.winbackIntro")}>
        {vinnsparat === "1" && <Notice tone="success">{t("mana.winbackSaved")}</Notice>}
        <form action={saveWinBackSetting} className="flex flex-col gap-4">
          <Label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-normal">
            <Checkbox name="enabled" defaultChecked={settings?.winBackEnabled ?? false} />
            {t("mana.winbackOn")}
          </Label>
          <SubmitButton variant="outline" className="self-start">
            {t("mana.winbackSave")}
          </SubmitButton>
        </form>
      </SectionCard>

      <SectionCard title={t("mana.rulesTitle")} description={t("mana.rulesIntro")}>
        {sparat === "1" && <Notice tone="success">{t("mana.rulesSaved")}</Notice>}
        {kinds.length === 0 ? (
          <p className="text-muted-foreground">{t("mana.rulesEmpty")}</p>
        ) : (
          <form action={saveMembershipRules} className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {kinds.map((k) => (
                <li key={k.membershipId}>
                  <fieldset className="flex flex-col gap-1 rounded-md border border-border p-3">
                    <legend className="sr-only">{k.name}</legend>
                    <Label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-normal">
                      <Checkbox name="counts" value={k.membershipId} defaultChecked={!ignored.includes(k.membershipId)} />
                      <span>
                        <span className="font-medium">{k.name}</span>{" "}
                        <span className="text-muted-foreground tabular-nums">({t("mana.rulesActive", { n: String(k.active) })})</span>
                      </span>
                    </Label>
                    <Label className="flex min-h-11 cursor-pointer items-center gap-3 pl-8 text-sm font-normal text-muted-foreground">
                      <Checkbox name="addOn" value={k.membershipId} defaultChecked={addOns.includes(k.membershipId)} />
                      {t("mana.rulesAddOn")}
                    </Label>
                  </fieldset>
                </li>
              ))}
            </ul>
            <SubmitButton className="self-start">{t("mana.rulesSave")}</SubmitButton>
          </form>
        )}
      </SectionCard>

      <SectionCard title={t("mana.recent")}>
        <ul className="flex flex-col divide-y divide-border">
          {status.recentRuns.map((run) => {
            const Icon = run.status === "succeeded" ? CheckCircle2 : run.status === "failed" ? CircleAlert : Loader;
            return (
              <li key={run.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    run.status === "succeeded" ? "text-tegen-mid-green" : run.status === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0">
                  <p className="font-medium">{t(`mana.run.${run.status}` as MessageKey)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{formatDateTime(run.startedAt)}</p>
                  {run.error && <p className="text-sm break-words text-danger-text">{run.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}
