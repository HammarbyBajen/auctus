import { ArrowDown, ArrowLeft, ArrowUp, Lock } from "lucide-react";
import { db } from "@/db";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Page } from "@/components/app/page";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatNumber } from "@/lib/format";
import { leadsPerStage, listColdReasons, listLeadFields, listStages, lockedStages } from "@/lib/pipeline/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import {
  addFieldAction,
  addReasonAction,
  addStageAction,
  moveReasonAction,
  moveStageAction,
  removeFieldAction,
  removeReasonAction,
  removeStageAction,
  renameReasonAction,
  renameStageAction,
  updateFieldAction,
} from "./actions";

export const dynamic = "force-dynamic";

const errors = ["locked", "has_leads", "invalid", "not_found"];

/** Up and down for something in an ordered list. */
function MoveButtons({ action, first, last, label }: { action: (form: FormData) => Promise<never>; first: boolean; last: boolean; label: string }) {
  return (
    <form action={action} className="flex gap-1">
      <Button type="submit" name="direction" value="up" size="icon" variant="ghost" disabled={first} aria-label={t("pipeline.moveUp", { name: label })}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button type="submit" name="direction" value="down" size="icon" variant="ghost" disabled={last} aria-label={t("pipeline.moveDown", { name: label })}>
        <ArrowDown aria-hidden="true" />
      </Button>
    </form>
  );
}

/** A name that can be changed in place. */
function RenameForm({ action, value, label }: { action: (form: FormData) => Promise<never>; value: string; label: string }) {
  return (
    <form action={action} className="flex min-w-0 flex-1 gap-2">
      <Input name="name" defaultValue={value} required maxLength={40} aria-label={label} className="min-w-0 flex-1" />
      <SubmitButton variant="outline" size="sm">
        {t("pipeline.save")}
      </SubmitButton>
    </form>
  );
}

/** "Ta bort", opening a confirmation step: works before the page's script has loaded. */
function RemoveStep({ children }: { children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="focus-ring inline-flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:min-h-9">
        {t("pipeline.remove")}
      </summary>
      <div className="mt-2 flex flex-col gap-2 rounded-md bg-well p-3">{children}</div>
    </details>
  );
}

/** Stages, Cold reasons and the studio's own lead fields (ticket 07). Owners only. */
export default async function PipelineSettingsPage({ searchParams }: { searchParams: Promise<{ sparat?: string; fel?: string }> }) {
  const owner = await requirePermission("settings", "manage");
  const { sparat, fel } = await searchParams;
  const [stages, reasons, fields, counts] = await Promise.all([
    listStages(db, owner.studioId),
    listColdReasons(db, owner.studioId),
    listLeadFields(db, owner.studioId),
    leadsPerStage(db, owner.studioId),
  ]);
  const open = stages.filter((s) => s.kind === "open");
  const closed = stages.filter((s) => s.kind !== "open");
  const error = errors.find((e) => e === fel);

  return (
    <Page
      title={t("pipeline.title")}
      description={t("pipeline.intro")}
      className="max-w-3xl"
      actions={
        <ButtonLink href="/installningar" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" />
          {t("settings.title")}
        </ButtonLink>
      }
    >
      {sparat === "1" && <Notice tone="success">{t("pipeline.saved")}</Notice>}
      {error && <Notice tone="danger">{t(`pipeline.error.${error}` as MessageKey)}</Notice>}

      <Panel title={t("pipeline.stagesTitle")} id="stages">
        <p className="text-sm text-muted-foreground">{t("pipeline.stagesIntro")}</p>
        <ul className="flex flex-col divide-y divide-border">
          {open.map((s, i) => {
            const n = counts.get(s.key) ?? 0;
            const locked = lockedStages.includes(s.key);
            return (
              <li key={s.key} className="flex flex-col gap-2 py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RenameForm action={renameStageAction.bind(null, s.key)} value={s.name} label={t("pipeline.nameOf", { name: s.name })} />
                  <MoveButtons action={moveStageAction.bind(null, s.key)} first={i === 0} last={i === open.length - 1} label={s.name} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{t("pipeline.leadsIn", { n: formatNumber(n) })}</span>
                  {locked ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock aria-hidden="true" className="size-3" />
                      {t("pipeline.locked")}
                    </span>
                  ) : (
                    <RemoveStep>
                      <form action={removeStageAction.bind(null, s.key)} className="flex flex-col gap-2">
                        {n > 0 ? (
                          <>
                            <Label htmlFor={`move-${s.key}`} className="text-sm">
                              {t("pipeline.moveLeadsFirst", { n: formatNumber(n) })}
                            </Label>
                            <NativeSelect id={`move-${s.key}`} name="moveTo" required defaultValue="">
                              <option value="" disabled>
                                {t("pipeline.chooseStage")}
                              </option>
                              {stages
                                .filter((o) => o.key !== s.key && o.kind !== "cold")
                                .map((o) => (
                                  <option key={o.key} value={o.key}>
                                    {o.name}
                                  </option>
                                ))}
                            </NativeSelect>
                          </>
                        ) : (
                          <p className="text-sm text-foreground">{t("pipeline.removeEmpty", { name: s.name })}</p>
                        )}
                        <SubmitButton variant="destructive" size="sm" className="self-start">
                          {n > 0 ? t("pipeline.moveAndRemove") : t("pipeline.confirmRemove")}
                        </SubmitButton>
                      </form>
                    </RemoveStep>
                  )}
                </div>
              </li>
            );
          })}
          {closed.map((s) => (
            <li key={s.key} className="flex flex-col gap-2 py-3 last:pb-0">
              <RenameForm action={renameStageAction.bind(null, s.key)} value={s.name} label={t("pipeline.nameOf", { name: s.name })} />
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock aria-hidden="true" className="size-3" />
                {s.kind === "won" ? t("pipeline.wonNote") : t("pipeline.coldNote")} · {t("pipeline.leadsIn", { n: formatNumber(counts.get(s.key) ?? 0) })}
              </p>
            </li>
          ))}
        </ul>
        <form action={addStageAction} className="flex gap-2 border-t border-border pt-4">
          <Input name="name" required maxLength={40} placeholder={t("pipeline.newStage")} aria-label={t("pipeline.newStage")} className="min-w-0 flex-1" />
          <SubmitButton>{t("pipeline.add")}</SubmitButton>
        </form>
      </Panel>

      <Panel title={t("pipeline.reasonsTitle")} id="reasons">
        <p className="text-sm text-muted-foreground">{t("pipeline.reasonsIntro")}</p>
        <ul className="flex flex-col divide-y divide-border">
          {reasons.map((r, i) => (
            <li key={r.key} className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
              <RenameForm action={renameReasonAction.bind(null, r.key)} value={r.name} label={t("pipeline.nameOf", { name: r.name })} />
              <MoveButtons action={moveReasonAction.bind(null, r.key)} first={i === 0} last={i === reasons.length - 1} label={r.name} />
              {reasons.length > 1 && (
                <RemoveStep>
                  <form action={removeReasonAction.bind(null, r.key)} className="flex flex-col gap-2">
                    <p className="text-sm">{t("pipeline.removeReason", { name: r.name })}</p>
                    <SubmitButton variant="destructive" size="sm" className="self-start">
                      {t("pipeline.confirmRemove")}
                    </SubmitButton>
                  </form>
                </RemoveStep>
              )}
            </li>
          ))}
        </ul>
        <form action={addReasonAction} className="flex gap-2 border-t border-border pt-4">
          <Input name="name" required maxLength={40} placeholder={t("pipeline.newReason")} aria-label={t("pipeline.newReason")} className="min-w-0 flex-1" />
          <SubmitButton>{t("pipeline.add")}</SubmitButton>
        </form>
      </Panel>

      <Panel title={t("pipeline.fieldsTitle")} id="fields">
        <p className="text-sm text-muted-foreground">{t("pipeline.fieldsIntro")}</p>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pipeline.noFields")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {fields.map((f) => (
              <li key={f.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <form action={updateFieldAction.bind(null, f.key)} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input name="label" defaultValue={f.label} required maxLength={40} aria-label={t("pipeline.nameOf", { name: f.label })} className="min-w-0 flex-1" />
                    <span className="text-xs text-muted-foreground">{f.type === "choice" ? t("pipeline.typeChoice") : t("pipeline.typeText")}</span>
                    <SubmitButton variant="outline" size="sm">
                      {t("pipeline.save")}
                    </SubmitButton>
                  </div>
                  {f.type === "choice" && (
                    <Textarea name="options" defaultValue={f.options.join("\n")} rows={3} aria-label={t("pipeline.choicesOf", { name: f.label })} className="text-sm" />
                  )}
                </form>
                <RemoveStep>
                  <form action={removeFieldAction.bind(null, f.key)} className="flex flex-col gap-2">
                    <p className="text-sm">{t("pipeline.removeField", { name: f.label })}</p>
                    <SubmitButton variant="destructive" size="sm" className="self-start">
                      {t("pipeline.confirmRemove")}
                    </SubmitButton>
                  </form>
                </RemoveStep>
              </li>
            ))}
          </ul>
        )}
        <form action={addFieldAction} className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-field">{t("pipeline.fieldName")}</Label>
              <Input id="new-field" name="label" required maxLength={40} placeholder={t("pipeline.fieldExample")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-type">{t("pipeline.fieldType")}</Label>
              <NativeSelect id="new-type" name="type" defaultValue="text">
                <option value="text">{t("pipeline.typeText")}</option>
                <option value="choice">{t("pipeline.typeChoice")}</option>
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-options">{t("pipeline.choices")}</Label>
            <Textarea id="new-options" name="options" rows={3} aria-describedby="new-options-hint" />
            <p id="new-options-hint" className="text-xs text-muted-foreground">
              {t("pipeline.choicesHint")}
            </p>
          </div>
          <SubmitButton className="self-start">{t("pipeline.addField")}</SubmitButton>
        </form>
      </Panel>
    </Page>
  );
}
