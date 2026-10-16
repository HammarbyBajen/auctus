import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime } from "@/lib/format";
import { getEmailSettings, listSuppressions } from "@/lib/email/service";
import { getAtRiskEmails } from "@/lib/mana/at-risk-service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { saveEmailSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

function TemplateFields({ prefix, subject, body, legend, hint }: { prefix: string; subject: string; body: string; legend: string; hint?: string }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-subject`}>{t("email.subject")}</Label>
        <Input id={`${prefix}-subject`} name={`${prefix}Subject`} maxLength={200} defaultValue={subject} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-body`}>{t("email.body")}</Label>
        <Textarea id={`${prefix}-body`} name={`${prefix}Body`} rows={6} maxLength={4000} defaultValue={body} aria-describedby="template-hint" />
      </div>
    </fieldset>
  );
}

/** Email from Tegen HQ (M8): the mode, the sender, Tegen's templates and the addresses never to mail again. Owners only. */
export default async function EmailSettingsPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { sparat, fel } = await searchParams;
  const [settings, atRisk, suppressed] = await Promise.all([getEmailSettings(db, user.studioId), getAtRiskEmails(db, user.studioId), listSuppressions(db, user.studioId)]);

  return (
    <Page
      title={t("emailSettings.title")}
      description={t("emailSettings.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("emailSettings.saved")}</Notice>}
      {fel === "avsandare" && <Notice tone="danger">{t("emailSettings.invalidFrom")}</Notice>}

      <form action={saveEmailSettingsAction} className="flex flex-col gap-6">
        <Panel title={t("emailSettings.modeTitle")} id="lage">
          <Notice tone={settings.mode === "live" ? "info" : "warning"}>{t(`emailSettings.mode.${settings.mode}` as MessageKey)}</Notice>
          <Label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm font-normal hover:bg-accent">
            <Checkbox name="live" defaultChecked={settings.ownerLive} className="mt-0.5" />
            <span className="flex flex-col gap-1">
              {t("emailSettings.live")}
              <span className="text-xs text-muted-foreground">{!settings.serverLive ? t("emailSettings.liveLocked") : !settings.hasSender ? t("emailSettings.liveNeedsSender") : t("emailSettings.liveHint")}</span>
            </span>
          </Label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="from">{t("emailSettings.from")}</Label>
            <Input id="from" name="from" maxLength={200} defaultValue={settings.from.includes("onboarding@resend.dev") ? "" : settings.from} aria-describedby="from-hint" />
            <p id="from-hint" className="text-xs text-muted-foreground">
              {t("emailSettings.fromHint")}
            </p>
          </div>
        </Panel>

        <Panel title={t("emailSettings.leadTitle")} id="mall-lead">
          <TemplateFields prefix="lead" legend={t("emailSettings.leadTitle")} subject={settings.leadEmail.subject} body={settings.leadEmail.body} />
        </Panel>

        <Panel title={t("emailSettings.atRiskTitle")} id="mall-borta">
          <p className="text-sm text-muted-foreground">{t("emailSettings.atRiskHint")}</p>
          <TemplateFields prefix="never" legend={t("atRisk.emailNever")} subject={atRisk.never.subject} body={atRisk.never.body} />
          <TemplateFields prefix="away" legend={t("atRisk.emailAway")} subject={atRisk.away.subject} body={atRisk.away.body} />
        </Panel>

        <p id="template-hint" className="text-xs text-muted-foreground">
          {t("emailSettings.hint")}
        </p>
        <SubmitButton className="self-start">{t("emailSettings.save")}</SubmitButton>
      </form>

      <Panel title={t("emailSettings.suppressedTitle")} id="sparrade">
        <p className="text-sm text-muted-foreground">{t("emailSettings.suppressedHint")}</p>
        {suppressed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emailSettings.suppressedNone")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {suppressed.map((s) => (
              <li key={s.address} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="break-all">{s.address}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`emailSettings.reason.${s.reason}` as MessageKey)} · {formatDateTime(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
