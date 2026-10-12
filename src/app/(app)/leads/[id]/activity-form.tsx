"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordActivity, type ActivityFormState } from "../actions";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { t, type MessageKey } from "@/lib/i18n";

/**
 * What happened, in one go: write a note if there is something to say, then
 * press what happened (Ringde, Inget svar, ...), which logs the contact and
 * saves the note with it. "Spara anteckning" saves a note on its own.
 */
export function ActivityForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<ActivityFormState, FormData>(recordActivity.bind(null, leadId), {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.saved) ref.current?.reset();
  }, [state.saved]);

  return (
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
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div role="group" aria-label={t("lead.contactTitle")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {contactOutcomes.map((outcome) => (
            <Button key={outcome} type="submit" name="intent" value={outcome} variant="outline" disabled={pending}>
              {t(`outcome.${outcome}` as MessageKey)}
            </Button>
          ))}
        </div>
        <Button type="submit" name="intent" value="note" variant="secondary" disabled={pending} className="sm:ml-auto">
          {pending ? t("app.saving") : t("lead.noteSubmit")}
        </Button>
      </div>
    </form>
  );
}
