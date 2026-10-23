"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Notice } from "@/components/app/notice";
import { SubmitButton } from "@/components/app/submit-button";
import type { ComposeState } from "@/app/(app)/email-actions";
import type { DraftState } from "@/app/(app)/draft-actions";
import type { EmailMode } from "@/lib/email/mode";
import { t, type MessageKey } from "@/lib/i18n";

/** Without the assistant, the draft button is not shown and this never runs. */
const noDraft = async (state: DraftState) => state;

/**
 * Writing an email to a lead or a member from Tegen HQ (M8 phase 1). Starts
 * from Tegen's template, can be changed before sending, and says plainly
 * where it will go: in test mode to Resend's test address, never the person.
 * With the assistant on, "Föreslå mejl" fills the form with a draft (ticket
 * 30, phase D) that the person reads and changes before sending.
 */
export function EmailComposer({
  id,
  action,
  to,
  subject,
  body,
  mode,
  draft,
}: {
  id: string;
  action: (state: ComposeState, formData: FormData) => Promise<ComposeState>;
  to: string;
  subject: string;
  body: string;
  mode: EmailMode;
  /** The assistant's draft, when it is on. */
  draft?: (state: DraftState, formData: FormData) => Promise<DraftState>;
}) {
  const [state, formAction] = useActionState(action, null);
  const [drafted, draftAction, drafting] = useActionState(draft ?? noDraft, { version: 0 });
  const field = (name: string) => `${id}-${name}`;
  const sent = state?.result === "sent" || state?.result === "not_sent";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Notice tone={mode === "live" ? "info" : "warning"}>{t(`email.mode.${mode}` as MessageKey, { to })}</Notice>
      {state?.error && <Notice tone="danger">{t(`email.error.${state.error}` as MessageKey)}</Notice>}
      {state?.result && <Notice tone={sent ? "success" : "danger"}>{t(`email.result.${state.result}` as MessageKey, { to })}</Notice>}
      {drafted.error && <Notice tone={drafted.error === "failed" ? "danger" : "warning"}>{t(`ai.error.${drafted.error}` as MessageKey)}</Notice>}
      <p className="text-sm">
        <span className="text-muted-foreground">{t("email.to")}</span> {to}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={field("subject")}>{t("email.subject")}</Label>
        {/* A new draft replaces what is in the fields: they are drawn again with it. */}
        <Input key={`subject-${drafted.version}`} id={field("subject")} name="subject" required maxLength={200} defaultValue={drafted.subject ?? subject} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={field("body")}>{t("email.body")}</Label>
        <Textarea key={`body-${drafted.version}`} id={field("body")} name="body" required rows={8} maxLength={10_000} defaultValue={drafted.body ?? body} />
        {drafted.suggestionId ? (
          <p className="text-xs text-muted-foreground">{t("ai.draft.note")}</p>
        ) : (
          !subject && !body && <p className="text-xs text-muted-foreground">{t("email.noTemplate")}</p>
        )}
      </div>
      {drafted.suggestionId && <input type="hidden" name="suggestion" value={drafted.suggestionId} />}
      {draft && (
        // Its own action on the same form: what is written so far goes with it, and nothing is sent.
        <Button type="submit" formAction={draftAction} formNoValidate variant="outline" disabled={drafting} className="self-start">
          <Sparkles aria-hidden="true" />
          {drafting ? t("ai.draft.writing") : drafted.suggestionId ? t("ai.draft.again") : t("ai.draft.suggest")}
        </Button>
      )}
      {/* Sending for real cannot be taken back, so it asks twice; a test send does not. */}
      {mode === "live" ? (
        <ConfirmButton className="self-start" confirmLabel={t("email.sendConfirm", { to })}>
          {t("email.send")}
        </ConfirmButton>
      ) : (
        <SubmitButton className="self-start" pendingLabel={t("email.sending")}>
          {mode === "test" ? t("email.sendTest") : t("email.save")}
        </SubmitButton>
      )}
    </form>
  );
}
