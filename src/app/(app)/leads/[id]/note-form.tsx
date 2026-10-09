"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addLeadNote, type NoteFormState } from "../actions";
import { t } from "@/lib/i18n";

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<NoteFormState, FormData>(addLeadNote.bind(null, leadId), {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) ref.current?.reset();
  }, [pending, state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <Label htmlFor="note-body">
        {t("lead.noteLabel")}
      </Label>
      <Textarea
        id="note-body"
        name="body"
        rows={3}
        aria-invalid={Boolean(state.error) || undefined}
        aria-describedby={state.error ? "note-error" : undefined}
      />
      {state.error && (
        <p id="note-error" role="alert" className="text-sm font-medium text-destructive">
          {t(state.error)}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t("app.saving") : t("lead.noteSubmit")}
      </Button>
    </form>
  );
}
