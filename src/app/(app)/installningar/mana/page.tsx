import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader } from "lucide-react";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getAddOnMembershipIds, getIgnoredMembershipIds, listMembershipKinds } from "@/lib/mana/leads";
import { getSyncStatus } from "@/lib/mana/status";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { saveMembershipRules, saveWinBackSetting, syncNow } from "./actions";

export const dynamic = "force-dynamic";

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
    db.select({ winBackEnabled: studioSettings.winBackEnabled }).from(studioSettings).where(eq(studioSettings.studioId, user.studioId)).limit(1),
  ]);

  return (
    <Page
      title={t("mana.title")}
      description={t("mana.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {!status.configured && <Notice tone="warning">{t("mana.notConfigured")}</Notice>}
      {startad === "1" && <Notice>{t("mana.started")}</Notice>}

      <Panel title={t("mana.lastSuccess")} id="sync">
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(10rem,100%),1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <MicroLabel as="dt">{t("mana.lastSuccess")}</MicroLabel>
            <dd className="text-sm font-medium tabular-nums">{status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : t("mana.never")}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <MicroLabel as="dt">{t("mana.members")}</MicroLabel>
            <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatNumber(status.members)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <MicroLabel as="dt">{t("mana.memberships")}</MicroLabel>
            <dd className="text-lg font-semibold tracking-tight tabular-nums">{formatNumber(status.memberships)}</dd>
          </div>
        </dl>
        <form action={syncNow}>
          <SubmitButton disabled={!status.configured || Boolean(status.running)} pendingLabel={t("mana.syncing")}>
            {status.running ? t("mana.syncing") : t("mana.syncNow")}
          </SubmitButton>
        </form>
      </Panel>

      <Panel title={t("mana.winbackTitle")} id="winback">
        <p className="text-sm text-muted-foreground">{t("mana.winbackIntro")}</p>
        {vinnsparat === "1" && <Notice tone="success">{t("mana.winbackSaved")}</Notice>}
        <form action={saveWinBackSetting} className="flex flex-col gap-3">
          <Label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal">
            <Checkbox name="enabled" defaultChecked={settings?.winBackEnabled ?? false} />
            {t("mana.winbackOn")}
          </Label>
          <SubmitButton variant="outline" className="self-start">
            {t("mana.winbackSave")}
          </SubmitButton>
        </form>
      </Panel>

      <Panel title={t("mana.rulesTitle")} id="rules">
        <p className="text-sm text-muted-foreground">{t("mana.rulesIntro")}</p>
        {sparat === "1" && <Notice tone="success">{t("mana.rulesSaved")}</Notice>}
        {kinds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("mana.rulesEmpty")}</p>
        ) : (
          <form action={saveMembershipRules} className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1">
              {kinds.map((k) => (
                <li key={k.membershipId}>
                  <fieldset className="flex flex-col rounded-md bg-well px-3 py-1">
                    <legend className="sr-only">{k.name}</legend>
                    <Label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal">
                      <Checkbox name="counts" value={k.membershipId} defaultChecked={!ignored.includes(k.membershipId)} />
                      <span>
                        <span className="font-medium">{k.name}</span>{" "}
                        <span className="text-muted-foreground tabular-nums">({t("mana.rulesActive", { n: formatNumber(k.active) })})</span>
                      </span>
                    </Label>
                    <Label className="flex min-h-11 cursor-pointer items-center gap-3 pl-8 text-xs font-normal text-muted-foreground">
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
      </Panel>

      <Panel title={t("mana.recent")} id="runs">
        <ul className="flex flex-col divide-y divide-border">
          {status.recentRuns.map((run) => {
            const Icon = run.status === "succeeded" ? CheckCircle2 : run.status === "failed" ? CircleAlert : Loader;
            return (
              <li key={run.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    run.status === "succeeded" ? "text-success" : run.status === "failed" ? "text-destructive" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`mana.run.${run.status}` as MessageKey)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(run.startedAt)}</p>
                  {run.error && <p className="text-xs break-words text-destructive">{run.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Page>
  );
}
