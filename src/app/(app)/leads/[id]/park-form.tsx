"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/app/notice";
import { parkLead, type ParkState } from "../actions";
import { parkPresets } from "@/lib/leads/park";
import { t, type MessageKey } from "@/lib/i18n";

/**
 * "Vänta till" (ticket 29): park a lead that is waiting on the lead itself.
 * Closed by default so it does not crowd the tasks; one press on a preset
 * parks it, with an optional why.
 */
export function ParkForm({ leadId, tomorrow }: { leadId: string; tomorrow: string }) {
  const [state, action, pending] = useActionState<ParkState, FormData>(parkLead.bind(null, leadId), {});
  const details = useRef<HTMLDetailsElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state.until) {
      form.current?.reset();
      if (details.current) details.current.open = false;
    }
  }, [pending, state]);

  return (
    <div className="flex flex-col gap-2">
      {state.until && <Notice tone="success">{t("park.done", { date: state.until })}</Notice>}
      <details ref={details} className="group rounded-md bg-well">
        <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium hover:bg-accent sm:min-h-9">
          {t("park.summary")}
        </summary>
        <form ref={form} action={action} className="flex flex-col gap-3 p-3">
          <p className="text-xs text-muted-foreground">{t("park.intro")}</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`park-why-${leadId}`}>{t("park.why")}</Label>
            <Input id={`park-why-${leadId}`} name="why" maxLength={200} autoComplete="off" />
          </div>
          <div className="flex flex-wrap gap-2">
            {parkPresets.map((p) => (
              <Button key={p} type="submit" name="preset" value={p} variant="outline" size="sm" disabled={pending}>
                {t(`park.${p}` as MessageKey)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`park-until-${leadId}`}>{t("park.date")}</Label>
              <Input id={`park-until-${leadId}`} name="until" type="date" min={tomorrow} defaultValue={tomorrow} className="w-44" />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              {pending ? t("app.saving") : t("park.submitDate")}
            </Button>
          </div>
          {state.error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t(state.error)}
            </p>
          )}
        </form>
      </details>
    </div>
  );
}
