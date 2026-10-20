"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/app/notice";
import { prepareCall, type BriefState } from "./ai-actions";
import { t, type MessageKey } from "@/lib/i18n";

type Brief = NonNullable<NonNullable<BriefState>["brief"]>;

/**
 * Before a call (ticket 30, phase B): a short brief from the assistant, made
 * only when someone presses the button. The last one is shown again until
 * something new happens on the lead.
 */
export function CallBrief({ leadId, initial }: { leadId: string; initial: Brief | null }) {
  const [state, action, pending] = useActionState<BriefState, FormData>(prepareCall.bind(null, leadId), initial ? { brief: initial } : null);
  const brief = state?.brief;

  return (
    <div className="flex flex-col gap-3">
      {state?.error && <Notice tone={state.error === "failed" ? "danger" : "warning"}>{t(`ai.error.${state.error}` as MessageKey)}</Notice>}
      {brief && (
        <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          <p>{brief.summary}</p>
          {brief.facts.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              {brief.facts.slice(0, 5).map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          )}
          <dl className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-muted-foreground">{t("ai.brief.opening")}</dt>
            <dd>{brief.opening}</dd>
            {brief.questions.length > 0 && (
              <>
                <dt className="text-muted-foreground">{t("ai.brief.questions")}</dt>
                <dd>
                  <ul className="flex flex-col gap-1">
                    {brief.questions.slice(0, 3).map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">{t("ai.brief.goal")}</dt>
            <dd>{brief.nextStep}</dd>
          </dl>
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
