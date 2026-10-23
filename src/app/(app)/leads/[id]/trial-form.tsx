"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTrialDate, type TrialState } from "../actions";
import { t } from "@/lib/i18n";

/**
 * "När är provträningen?" (ticket 33), on a lead at Bokat provträning with
 * nothing planned: the date gives a task the day after, to hear how it went.
 * Trials are booked outside Mana, so Tegen HQ cannot tell by itself. Once
 * saved, the task shows in the list and this form gives way.
 */
export function TrialForm({ leadId, today, earliest }: { leadId: string; today: string; earliest: string }) {
  const [state, action, pending] = useActionState<TrialState, FormData>(saveTrialDate.bind(null, leadId), {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-md bg-well p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`trial-${leadId}`}>{t("trial.label")}</Label>
        <p id={`trial-hint-${leadId}`} className="text-xs text-muted-foreground">
          {t("trial.hint")}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          id={`trial-${leadId}`}
          name="trial"
          type="date"
          min={earliest}
          defaultValue={today}
          required
          aria-describedby={`trial-hint-${leadId}`}
          className="w-44"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? t("app.saving") : t("trial.submit")}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(state.error)}
        </p>
      )}
    </form>
  );
}
