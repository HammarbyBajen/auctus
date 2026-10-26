"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { prepareCall, type BriefState } from "./ai-actions";
import { t, type MessageKey } from "@/lib/i18n";

type Brief = NonNullable<NonNullable<BriefState>["brief"]>;

/**
 * Before getting in touch (ticket 30, phase B): a short summary of the lead
 * from the assistant, so nobody has to read the whole history. Made only when
 * someone presses the button; shown again until something new happens.
 */
export function CallBrief({ leadId, initial }: { leadId: string; initial: Brief | null }) {
  const [state, action, pending] = useActionState<BriefState, FormData>(prepareCall.bind(null, leadId), initial ? { brief: initial } : null);
  const brief = state?.brief;

  return (
    <div className="flex flex-col gap-3">
      {state?.error && <Notice tone={state.error === "failed" ? "danger" : "warning"}>{t(`ai.error.${state.error}` as MessageKey)}</Notice>}
      {brief && (
        <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          <p className="leading-6">{brief.tldr}</p>
          {brief.facts.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              {brief.facts.slice(0, 4).map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          )}
          <p>
            <span className="text-muted-foreground">{t("ai.brief.next")}</span> {brief.nextStep}
          </p>
          <p className="text-xs text-muted-foreground">{t("ai.brief.note")}</p>
        </div>
      )}
      <form action={action}>
        <Button type="submit" variant={brief ? "ghost" : "secondary"} size="sm" disabled={pending}>
          <Sparkles aria-hidden="true" />
          {pending ? t("ai.brief.preparing") : brief ? t("ai.brief.again") : t("ai.brief.prepare")}
        </Button>
      </form>
    </div>
  );
}
