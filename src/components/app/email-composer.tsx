"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Notice } from "@/components/app/notice";
import { SubmitButton } from "@/components/app/submit-button";
import type { ComposeState } from "@/app/(app)/email-actions";
import type { EmailMode } from "@/lib/email/mode";
import { t, type MessageKey } from "@/lib/i18n";

/**
 * Writing an email to a lead or a member from Tegen HQ (M8 phase 1). Starts
 * from Tegen's template, can be changed before sending, and says plainly
 * where it will go: in test mode to Resend's test address, never the person.
 */
export function EmailComposer({
  id,
  action,
  to,
  subject,
  body,
  mode,
}: {
  id: string;
  action: (state: ComposeState, formData: FormData) => Promise<ComposeState>;
  to: string;
  subject: string;
  body: string;
  mode: EmailMode;
}) {
  const [state, formAction] = useActionState(action, null);
  const field = (name: string) => `${id}-${name}`;
  const sent = state?.result === "sent" || state?.result === "not_sent";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Notice tone={mode === "live" ? "info" : "warning"}>{t(`email.mode.${mode}` as MessageKey, { to })}</Notice>
      {state?.error && <Notice tone="danger">{t(`email.error.${state.error}` as MessageKey)}</Notice>}
      {state?.result && <Notice tone={sent ? "success" : "danger"}>{t(`email.result.${state.result}` as MessageKey, { to })}</Notice>}
      <p className="text-sm">
        <span className="text-muted-foreground">{t("email.to")}</span> {to}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={field("subject")}>{t("email.subject")}</Label>
        <Input id={field("subject")} name="subject" required maxLength={200} defaultValue={subject} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={field("body")}>{t("email.body")}</Label>
        <Textarea id={field("body")} name="body" required rows={8} maxLength={10_000} defaultValue={body} />
        {!subject && !body && <p className="text-xs text-muted-foreground">{t("email.noTemplate")}</p>}
      </div>
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
