"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordActivity, type ActivityFormState } from "../actions";
import { saveSteps, suggestSteps, type StepsState } from "./ai-actions";
import { Notice } from "@/components/app/notice";
import { formatDay } from "@/lib/format";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { t, type MessageKey } from "@/lib/i18n";

/**
 * What happened, in one go: write a note if there is something to say, then
 * press what happened (Ringde, Inget svar, ...), which logs the contact and
 * saves the note with it. "Spara anteckning" saves a note on its own.
 */
/** Names the steps can show: the studio's stages and Cold reasons. Present only when the assistant is on. */
export type AssistantNames = { stages: Record<string, string>; reasons: Record<string, string> };

export function ActivityForm({ leadId, showPrivate = false, assistant = null }: { leadId: string; showPrivate?: boolean; assistant?: AssistantNames | null }) {
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(recordActivity.bind(null, leadId), {});
  // The assistant (ticket 30, phase B): steps from the note being written, approved below.
  const [proposal, suggest, suggesting] = useActionState<StepsState, FormData>(suggestSteps.bind(null, leadId), null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) ref.current?.reset();
  }, [state.saved]);
  const clearNote = useCallback(() => ref.current?.reset(), []);

  return (
    <>
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <Label htmlFor="activity-body">{t("lead.activityLabel")}</Label>
      <Textarea
        id="activity-body"
        name="body"
        rows={3}
        placeholder={t("lead.activityPlaceholder")}
        aria-invalid={Boolean(state.error) || undefined}
        aria-describedby={state.error ? "activity-error" : "activity-hint"}
      />
      {state.error ? (
        <p id="activity-error" role="alert" className="text-sm font-medium text-destructive">
          {t(state.error)}
        </p>
      ) : (
        <p id="activity-hint" className="text-xs text-muted-foreground">
          {t("lead.activityHint")}
        </p>
      )}
      {/* Only once the assistant is switched on: until then nothing is ever sent, so there is nothing to keep private from. */}
      {showPrivate && (
        <Label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal sm:min-h-9">
          <Checkbox name="private" />
          {t("lead.notePrivate")}
        </Label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div role="group" aria-label={t("lead.contactTitle")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {contactOutcomes.map((outcome) => (
            <Button key={outcome} type="submit" name="intent" value={outcome} variant="outline" disabled={pending}>
              {t(`outcome.${outcome}` as MessageKey)}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          {assistant && (
            <Button type="submit" formAction={suggest} variant="ghost" disabled={pending || suggesting}>
              <Sparkles aria-hidden="true" />
              {suggesting ? t("ai.steps.suggesting") : t("ai.steps.suggest")}
            </Button>
          )}
          <Button type="submit" name="intent" value="note" variant="secondary" disabled={pending}>
            {pending ? t("app.saving") : t("lead.noteSubmit")}
          </Button>
        </div>
      </div>
    </form>
    {assistant && proposal && (
      <Proposal key={proposal.suggestionId ?? proposal.error} leadId={leadId} proposal={proposal} names={assistant} onSaved={clearNote} />
    )}
    </>
  );
}

type Steps = NonNullable<NonNullable<StepsState>["steps"]>;

function stepText(step: Steps[number], names: AssistantNames): string {
  switch (step.type) {
    case "log_contact":
      return t("ai.step.log_contact", { outcome: t(`outcome.${step.outcome}` as MessageKey) });
    case "add_note":
      return t("ai.step.add_note", { body: step.body });
    case "create_task":
      return t("ai.step.create_task", { title: step.title, date: formatDay(step.dueDate) });
    case "move_stage": {
      const stage = names.stages[step.stage] ?? step.stage;
      return step.coldReason ? t("ai.step.move_cold", { stage, reason: names.reasons[step.coldReason] ?? step.coldReason }) : t("ai.step.move_stage", { stage });
    }
  }
}

/** The assistant's proposed steps, each to tick; nothing is saved until "Spara valda". */
function Proposal({ leadId, proposal, names, onSaved }: { leadId: string; proposal: NonNullable<StepsState>; names: AssistantNames; onSaved: () => void }) {
  const [result, save, saving] = useActionState<StepsState, FormData>(saveSteps.bind(null, leadId, proposal.suggestionId ?? ""), null);
  const saved = result?.saved;

  // Clear the note once its steps are saved: the note itself is among them.
  useEffect(() => {
    if (saved !== undefined && saved > 0) onSaved();
  }, [saved, onSaved]);

  if (proposal.error) {
    return <Notice tone={proposal.error === "failed" ? "danger" : "warning"}>{t(`ai.error.${proposal.error}` as MessageKey)}</Notice>;
  }
  if (saved !== undefined) {
    return <Notice tone="success">{saved > 0 ? t("ai.steps.saved", { n: String(saved) }) : t("ai.steps.nothingSaved")}</Notice>;
  }
  return (
    <form action={save} className="flex flex-col gap-3 rounded-md bg-well p-3" aria-live="polite">
      <p className="text-sm font-medium">{t("ai.steps.title")}</p>
      {proposal.explanation && <p className="text-xs text-muted-foreground">{proposal.explanation}</p>}
      <div className="flex flex-col gap-1">
        {(proposal.steps ?? []).map((step, i) => (
          <Label key={i} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm font-normal hover:bg-accent sm:min-h-9">
            <Checkbox name="step" value={String(i)} defaultChecked className="mt-0.5" />
            <span className="break-words">{stepText(step, names)}</span>
          </Label>
        ))}
      </div>
      {result?.error && <Notice tone="danger">{t(`ai.error.${result.error}` as MessageKey)}</Notice>}
      <p className="text-xs text-muted-foreground">{t("ai.steps.hint")}</p>
      <Button type="submit" size="sm" className="self-start" disabled={saving}>
        {saving ? t("app.saving") : t("ai.steps.save")}
      </Button>
    </form>
  );
}
