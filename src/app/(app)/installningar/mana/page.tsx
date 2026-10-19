import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader, Minus, Plus } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getAddOnMembershipIds, getIgnoredMembershipIds, listMembershipKinds } from "@/lib/mana/leads";
import { syncEndpoints } from "@/lib/mana/api-watch";
import { getApiWatchStatus } from "@/lib/mana/api-watch-service";
import { getSyncStatus } from "@/lib/mana/status";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { acknowledgeApi, saveAtRiskDays, saveMembershipRules, saveWinBackSetting, syncNow } from "./actions";

export const dynamic = "force-dynamic";

export default async function ManaPage({
  searchParams,
}: {
  searchParams: Promise<{ startad?: string; sparat?: string; vinnsparat?: string; risksparat?: string; riskfel?: string}>;
}) {
  const user = await requirePermission("settings", "manage");
  const { startad, sparat, vinnsparat, risksparat, riskfel } = await searchParams;
  const [status, kinds, ignored, addOns, [settings], api] = await Promise.all([
    getSyncStatus(db, user.studioId),
    listMembershipKinds(db, user.studioId),
    getIgnoredMembershipIds(db, user.studioId),
    getAddOnMembershipIds(db, user.studioId),
    db.select({ winBackEnabled: studioSettings.winBackEnabled, atRiskDays: studioSettings.atRiskDays }).from(studioSettings).where(eq(studioSettings.studioId, user.studioId)).limit(1),
    getApiWatchStatus(db),
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
        {status.running?.pausedUntil && <p className="text-xs text-muted-foreground">{t("mana.paused", { time: formatDateTime(status.running.pausedUntil) })}</p>}
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

      <Panel title={t("atRisk.settingsTitle")} id="at-risk">
        <p className="text-sm text-muted-foreground">{t("atRisk.settingsIntro")}</p>
        {risksparat === "1" && <Notice tone="success">{t("atRisk.settingsSaved")}</Notice>}
        {riskfel === "1" && <Notice tone="danger">{t("atRisk.settingsError")}</Notice>}
        <form action={saveAtRiskDays} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="at-risk-days">{t("atRisk.settingsLabel")}</Label>
            <Input id="at-risk-days" name="days" type="number" inputMode="numeric" min={7} max={180} required defaultValue={settings?.atRiskDays ?? 30} className="w-28" />
          </div>
          <SubmitButton variant="outline">{t("atRisk.settingsSave")}</SubmitButton>
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

      <Panel title={t("mana.api.title")} id="api">
        <p className="text-sm text-muted-foreground">{t("mana.api.intro")}</p>
        {!api.lastCheck && <p className="text-sm text-muted-foreground">{t("mana.api.never")}</p>}
        {api.lastCheck && !api.lastCheck.ok && (
          <Notice tone="warning">{t("mana.api.failed", { when: formatDateTime(api.lastCheck.at), error: api.lastCheck.error ?? "" })}</Notice>
        )}
        {api.lastCheck?.ok && api.pending.length === 0 && (
          <p className="text-sm">{t("mana.api.ok", { when: formatDateTime(api.lastCheck.at) })}</p>
        )}
        {api.pending.map((check) => (
          <ApiChanges key={check.id} at={check.at} added={check.changes.added} removed={check.changes.removed} />
        ))}
        {api.pending.length > 0 && (
          <form action={acknowledgeApi}>
            <SubmitButton variant="outline">{t("mana.api.acknowledge")}</SubmitButton>
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
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(run.startedAt)} · {t(`mana.run.mode.${run.mode}` as MessageKey)}
                    {run.requests !== null && ` · ${t("mana.run.requests", { n: formatNumber(run.requests) })}`}
                  </p>
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

/** At most this many changed lines are listed per check; the rest are counted. */
const shownLines = 200;

/** One check's changes, grouped by endpoint, the ones the sync reads marked. */
function ApiChanges({ at, added, removed }: { at: Date; added: string[]; removed: string[] }) {
  const lines = [...removed.map((l) => ({ l, added: false })), ...added.map((l) => ({ l, added: true }))];
  const groups = new Map<string, { text: string; added: boolean }[]>();
  for (const { l, added: isAdded } of lines.slice(0, shownLines)) {
    const [endpoint, ...rest] = l.split(" · ");
    const list = groups.get(endpoint) ?? [];
    list.push({ text: rest.join(" · ") || t("mana.api.endpoint"), added: isAdded });
    groups.set(endpoint, list);
  }
  return (
    <section className="flex flex-col gap-3">
      <MicroLabel as="h3">{t("mana.api.changedOn", { when: formatDateTime(at) })}</MicroLabel>
      <ul className="flex flex-col gap-3">
        {[...groups].map(([endpoint, items]) => (
          <li key={endpoint} className="flex flex-col gap-1 rounded-md bg-well px-3 py-2">
            <p className="flex flex-wrap items-center gap-2 font-mono text-xs font-medium break-all">
              {endpoint}
              {syncEndpoints.includes(endpoint) && <Chip tone="warning">{t("mana.api.affectsSync")}</Chip>}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item, i) => {
                const Icon = item.added ? Plus : Minus;
                return (
                  <li key={i} className="flex items-start gap-2 font-mono text-xs break-all text-muted-foreground">
                    <Icon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                    <span className="sr-only">{item.added ? t("mana.api.added") : t("mana.api.removed")}</span>
                    {item.text}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      {lines.length > shownLines && (
        <p className="text-xs text-muted-foreground">{t("mana.api.more", { n: formatNumber(lines.length - shownLines) })}</p>
      )}
    </section>
  );
}
