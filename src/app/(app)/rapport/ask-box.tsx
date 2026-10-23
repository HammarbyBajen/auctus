"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MicroLabel } from "@/components/app/micro-label";
import { Notice } from "@/components/app/notice";
import { SubmitButton } from "@/components/app/submit-button";
import { t, type MessageKey } from "@/lib/i18n";
import { askQuestion, type QuestionState } from "./actions";

/** "Fråga assistenten" (ticket 30, phase E): owners ask about the business in plain Swedish. */
export function AskBox() {
  const [state, action] = useActionState<QuestionState, FormData>(askQuestion, null);
  const answer = state?.answer;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <Label htmlFor="ask-question">{t("ai.ask.label")}</Label>
        <Textarea id="ask-question" name="question" rows={2} maxLength={500} defaultValue={state?.question ?? ""} placeholder={t("ai.ask.placeholder")} />
        <SubmitButton className="self-start" pendingLabel={t("ai.ask.thinking")}>
          <Sparkles aria-hidden="true" />
          {t("ai.ask.submit")}
        </SubmitButton>
      </form>
      {state?.error && (
        <Notice tone={state.error === "failed" ? "danger" : "warning"}>{t(state.error === "empty" ? "ai.ask.empty" : (`ai.error.${state.error}` as MessageKey))}</Notice>
      )}
      {answer && (
        <div aria-live="polite" className="flex flex-col gap-3 rounded-md bg-well p-4">
          <p className="text-sm leading-6 whitespace-pre-line">{answer.answer}</p>
          {answer.figures.length > 0 && (
            <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-3">
              {answer.figures.map((f, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <MicroLabel as="dt">{f.label}</MicroLabel>
                  <dd className="text-base font-semibold tabular-nums">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-muted-foreground">
            {answer.unsure ? `${t("ai.ask.unsure")} ` : ""}
            {answer.basis}
          </p>
        </div>
      )}
    </div>
  );
}
