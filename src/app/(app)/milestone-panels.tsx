"use client";

import { useState } from "react";
import { Check, Mail, Phone } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { EmailComposer } from "@/components/app/email-composer";
import type { ComposeState } from "./email-actions";
import type { DraftState } from "./draft-actions";
import type { EmailMode } from "@/lib/email/mode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** A milestone's buttons on Medlemmar (ticket 35): call, write a congratulation, or mark it done or skipped. */
export function MilestonePanels({
  id,
  name,
  phone,
  email,
  doneAction,
  skipAction,
}: {
  id: string;
  name: string;
  phone: string | null;
  email: {
    to: string;
    subject: string;
    body: string;
    mode: EmailMode;
    action: (state: ComposeState, formData: FormData) => Promise<ComposeState>;
    draft?: (state: DraftState, formData: FormData) => Promise<DraftState>;
  } | null;
  doneAction: () => Promise<void>;
  skipAction: () => Promise<void>;
}) {
  const [writing, setWriting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {email && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={writing}
            aria-controls={`${id}-email`}
            onClick={() => setWriting((open) => !open)}
            className={cn(writing && "bg-accent")}
          >
            <Mail aria-hidden="true" />
            {t("milestones.email")}
          </Button>
        )}
        {phone && (
          <ButtonAnchor href={`tel:${phone.replace(/[^\d+]/g, "")}`} variant="outline" size="sm" aria-label={`${t("milestones.call")} ${name}`}>
            <Phone aria-hidden="true" />
            {t("milestones.call")}
          </ButtonAnchor>
        )}
        <form action={doneAction}>
          <Button type="submit" size="sm" variant="secondary">
            <Check aria-hidden="true" />
            {t("milestones.done")}
          </Button>
        </form>
        <form action={skipAction}>
          <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
            {t("milestones.skip")}
          </Button>
        </form>
      </div>
      {writing && email && (
        <div id={`${id}-email`} className="rounded-md bg-well p-3">
          <EmailComposer id={`${id}-compose`} action={email.action} to={email.to} subject={email.subject} body={email.body} mode={email.mode} draft={email.draft} />
        </div>
      )}
    </div>
  );
}
