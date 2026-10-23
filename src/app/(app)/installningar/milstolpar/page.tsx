import { ArrowLeft, Trash2 } from "lucide-react";
import { db } from "@/db";
import { ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatNumber } from "@/lib/format";
import { fillMilestone, milestoneKinds } from "@/lib/mana/milestones";
import { listMilestoneRules } from "@/lib/mana/milestones-service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { addRule, removeRule, saveRule } from "./actions";

/** The name the preview is filled in with. */
const exampleName = "Anna";

/** Milstolpar's settings (ticket 35): which milestones count, and the message for each. Owners only. */
export default async function MilestoneSettingsPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string }> }) {
  const user = await requirePermission("settings", "manage");
  const { sparat, fel } = await searchParams;
  const rules = await listMilestoneRules(db, user.studioId);

  return (
    <Page
      title={t("milestones.title")}
      description={t("milestones.settingsIntro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("milestones.saved")}</Notice>}
      {milestoneKinds.map((kind) => (
        <Panel key={kind} title={t(`milestones.group.${kind}` as MessageKey)} id={kind}>
          <p className="text-sm text-muted-foreground">{t(`milestones.groupHint.${kind}` as MessageKey)}</p>
          <ul className="flex flex-col gap-2">
            {rules
              .filter((r) => r.kind === kind)
              .map((r) => {
                const label = t(`milestones.kind.${kind}` as MessageKey, { n: formatNumber(r.threshold) });
                return (
                  <li key={r.id} id={`regel-${r.id}`} className="scroll-mt-20">
                    <details className="rounded-md bg-well">
                      <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 text-sm font-medium hover:bg-accent [&::-webkit-details-marker]:hidden">
                        {label}
                        {!r.active && <span className="text-xs font-normal text-muted-foreground">{t("milestones.off")}</span>}
                      </summary>
                      <div className="flex flex-col gap-4 p-3">
                        <form action={saveRule.bind(null, r.id)} className="flex flex-col gap-3">
                          <Label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal">
                            <Checkbox name="active" defaultChecked={r.active} />
                            {t("milestones.active")}
                          </Label>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`subject-${r.id}`}>{t("milestones.subject")}</Label>
                            <Input id={`subject-${r.id}`} name="subject" defaultValue={r.subject} maxLength={200} />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`body-${r.id}`}>{t("milestones.body")}</Label>
                            <Textarea id={`body-${r.id}`} name="body" rows={6} defaultValue={r.body} maxLength={5000} />
                          </div>
                          <SubmitButton variant="outline" className="self-start">
                            {t("milestones.save")}
                          </SubmitButton>
                        </form>
                        <div className="flex flex-col gap-1 rounded-md bg-card p-3 text-sm">
                          <p className="text-xs text-muted-foreground">{t("milestones.preview")}</p>
                          <p className="font-medium">{fillMilestone(r.subject, exampleName, r.threshold)}</p>
                          <p className="whitespace-pre-line text-muted-foreground">{fillMilestone(r.body, exampleName, r.threshold)}</p>
                        </div>
                        <form action={removeRule.bind(null, r.id)}>
                          <SubmitButton variant="ghost" size="sm" className="text-muted-foreground" keepLabel>
                            <Trash2 aria-hidden="true" />
                            {t("milestones.remove")}
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  </li>
                );
              })}
          </ul>
        </Panel>
      ))}

      <Panel title={t("milestones.add")} id="ny">
        {(fel === "invalid" || fel === "exists") && <Notice tone="danger">{t(`milestones.error.${fel}` as MessageKey)}</Notice>}
        <form action={addRule} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="milestone-kind">{t("milestones.addKind")}</Label>
            <NativeSelect id="milestone-kind" name="kind" defaultValue="classes_total">
              {milestoneKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`milestones.group.${kind}` as MessageKey)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="milestone-threshold">{t("milestones.addNumber")}</Label>
            <Input id="milestone-threshold" name="threshold" type="number" inputMode="numeric" min={1} max={100000} required className="w-32" />
          </div>
          <SubmitButton variant="outline">{t("milestones.addSubmit")}</SubmitButton>
        </form>
      </Panel>
    </Page>
  );
}
