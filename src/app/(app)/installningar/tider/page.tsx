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
import { allWeekdays } from "@/lib/home/clock";
import { getThresholds } from "@/lib/home/service";
import { stalledFieldPrefix, type ThresholdsError } from "@/lib/home/thresholds-form";
import { initialStage } from "@/lib/leads/constants";
import { listStages } from "@/lib/pipeline/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { saveThresholds } from "./actions";

export const dynamic = "force-dynamic";

const errors: ThresholdsError[] = ["firstContact", "warn", "stalled", "daysOff"];

/** How fast new leads should be contacted, and which days that clock runs (ticket 06). Owners only. */
export default async function TimesPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { sparat, fel } = await searchParams;
  const [thresholds, stages] = await Promise.all([getThresholds(db, user.studioId), listStages(db, user.studioId)]);
  // The first stage has the first-contact deadline instead; won and cold leads are never stalled.
  const stalledStages = stages.filter((s) => s.kind === "open" && s.key !== initialStage);
  const error = errors.find((e) => e === fel);
  const number = (name: keyof typeof thresholds, label: MessageKey, min: number, max: number) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{t(label)}</Label>
      <Input id={name} name={name} type="number" inputMode="numeric" min={min} max={max} required defaultValue={String(thresholds[name])} className="w-28" />
    </div>
  );

  return (
    <Page
      title={t("times.title")}
      description={t("times.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("times.saved")}</Notice>}
      {error && <Notice tone="danger">{t(`times.error.${error}` as MessageKey)}</Notice>}
      <form action={saveThresholds} className="flex flex-col gap-6">
        <Panel title={t("times.limitsTitle")} id="limits">
          <div className="flex flex-col gap-4">
            {number("firstContactHours", "times.firstContact", 1, 168)}
            {number("warnHoursBeforeDeadline", "times.warn", 0, 167)}
          </div>
        </Panel>

        <Panel title={t("times.stalledTitle")} id="stalled">
          <p className="text-sm text-muted-foreground">{t("times.stalledHint")}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(12rem,100%),1fr))] gap-4">
            {stalledStages.map((s) => (
              <div key={s.key} className="flex flex-col gap-2">
                <Label htmlFor={`stalled-${s.key}`}>{s.name}</Label>
                <Input
                  id={`stalled-${s.key}`}
                  name={`${stalledFieldPrefix}${s.key}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  required
                  defaultValue={String(thresholds.stalledDaysByStage[s.key] ?? thresholds.stalledDays)}
                  className="w-28"
                />
              </div>
            ))}
          </div>
          {number("stalledDays", "times.stalled", 1, 90)}
        </Panel>

        <Panel title={t("times.clockTitle")} id="clock">
          <p className="text-sm text-muted-foreground">{t("times.clockHint")}</p>
          <fieldset className="flex flex-col gap-1">
            <legend className="sr-only">{t("times.clockTitle")}</legend>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {allWeekdays.map((d) => (
                <Label key={d} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent">
                  <Checkbox name="clockDays" value={String(d)} defaultChecked={thresholds.clockDays.includes(d)} />
                  {t(`weekday.${d}` as MessageKey)}
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="daysOff">{t("times.daysOff")}</Label>
            <Textarea id="daysOff" name="daysOff" rows={4} defaultValue={thresholds.daysOff.join("\n")} aria-describedby="daysOff-hint" className="max-w-xs font-mono" />
            <p id="daysOff-hint" className="text-xs text-muted-foreground">
              {t("times.daysOffHint")}
            </p>
          </div>
        </Panel>

        <SubmitButton className="self-start">{t("times.save")}</SubmitButton>
      </form>
    </Page>
  );
}
