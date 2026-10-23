"use client";

import { useState } from "react";
import { History, Mail, MessageSquare, Phone } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { EmailComposer } from "@/components/app/email-composer";
import { SubmitButton } from "@/components/app/submit-button";
import type { ComposeState } from "./email-actions";
import type { DraftState } from "./draft-actions";
import type { EmailMode } from "@/lib/email/mode";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";

type Panel = "email" | "log" | "dismiss" | "history" | null;

/**
 * A member's buttons on the Hör av dig till list, with the form for each
 * opening below the row at full width, so nothing jumps sideways.
 */
export function AtRiskPanels({
  id,
  name,
  phone,
  email,
  history,
  logAction,
  dismissAction,
  outcomes,
  reasons,
  minReturnBy,
}: {
  id: string;
  name: string;
  phone: string | null;
  /** Writing to them from Tegen HQ, with Tegen's template for their group (M8 phase 1). */
  email: {
    to: string;
    subject: string;
    body: string;
    mode: EmailMode;
    action: (state: ComposeState, formData: FormData) => Promise<ComposeState>;
    /** The assistant's draft, when it is on (ticket 30, phase D). */
    draft?: (state: DraftState, formData: FormData) => Promise<DraftState>;
  } | null;
  history: React.ReactNode | null;
  logAction: (formData: FormData) => Promise<void>;
  dismissAction: (formData: FormData) => Promise<void>;
  outcomes: readonly string[];
  reasons: readonly string[];
  minReturnBy: string;
}) {
  const [open, setOpen] = useState<Panel>(null);
  const toggle = (panel: Panel) => setOpen((current) => (current === panel ? null : panel));
  const panelId = (panel: string) => `${id}-${panel}`;
  // Saving closes the form; the row then shows what was logged.
  const submitThenClose = (action: (formData: FormData) => Promise<void>) => async (formData: FormData) => {
    await action(formData);
    setOpen(null);
  };
  const toggleButton = (panel: Exclude<Panel, null>, label: string, icon?: React.ReactNode) => (
    <Button
      type="button"
      size="sm"
      variant={panel === "log" ? "secondary" : panel === "email" ? "outline" : "ghost"}
      aria-expanded={open === panel}
      aria-controls={panelId(panel)}
      onClick={() => toggle(panel)}
      className={cn(panel !== "log" && panel !== "email" && "text-muted-foreground", open === panel && "bg-accent text-foreground")}
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {phone && (
          <ButtonAnchor href={`tel:${phone.replace(/[^\d+]/g, "")}`} variant="outline" size="sm" aria-label={`${t("home.call")} ${name}`}>
            <Phone aria-hidden="true" />
            {t("home.call")}
          </ButtonAnchor>
        )}
        {email && toggleButton("email", t("atRisk.email"), <Mail aria-hidden="true" />)}
        {toggleButton("log", t("atRisk.log"), <MessageSquare aria-hidden="true" />)}
        {toggleButton("dismiss", t("atRisk.dismiss"))}
        {history && toggleButton("history", t("atRisk.history"), <History aria-hidden="true" />)}
      </div>

      {open === "email" && email && (
        <div id={panelId("email")} className="rounded-md bg-well p-3">
          <EmailComposer id={panelId("compose")} action={email.action} to={email.to} subject={email.subject} body={email.body} mode={email.mode} draft={email.draft} />
        </div>
      )}

      {open === "log" && (
        <form id={panelId("log")} action={submitThenClose(logAction)} className="flex flex-col gap-3 rounded-md bg-well p-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{t("atRisk.logLabel")}</legend>
            <RadioGroup name="outcome" required className="gap-0 sm:grid-cols-3">
              {outcomes.map((o) => (
                <Label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent sm:min-h-9">
                  <RadioGroupItem value={o} />
                  {t(`atRisk.outcome.${o}` as MessageKey)}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor={panelId("log-note")}>{t("atRisk.noteLabel")}</Label>
            <Textarea id={panelId("log-note")} name="note" rows={2} maxLength={2000} placeholder={t("atRisk.notePlaceholder")} />
          </div>
          <SubmitButton size="sm" className="self-start">
            {t("atRisk.logSave")}
          </SubmitButton>
        </form>
      )}

      {open === "dismiss" && (
        <form id={panelId("dismiss")} action={submitThenClose(dismissAction)} className="flex flex-col gap-3 rounded-md bg-well p-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{t("atRisk.reasonLabel")}</legend>
            <RadioGroup name="reason" required className="gap-0 sm:grid-cols-3">
              {reasons.map((reason) => (
                <Label key={reason} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent sm:min-h-9">
                  <RadioGroupItem value={reason} />
                  {t(`atRisk.reason.${reason}` as MessageKey)}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor={panelId("return")}>{t("atRisk.returnBy")}</Label>
            <Input id={panelId("return")} name="returnBy" type="date" min={minReturnBy} className="w-44" aria-describedby={panelId("return-hint")} />
            <p id={panelId("return-hint")} className="text-xs text-muted-foreground">
              {t("atRisk.returnByHint")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={panelId("dismiss-note")}>{t("atRisk.noteLabel")}</Label>
            <Textarea id={panelId("dismiss-note")} name="note" rows={2} maxLength={2000} />
          </div>
          <SubmitButton size="sm" className="self-start">
            {t("atRisk.dismiss")}
          </SubmitButton>
        </form>
      )}

      {open === "history" && history && (
        <div id={panelId("history")} className="rounded-md bg-well p-3">
          {history}
        </div>
      )}
    </div>
  );
}
