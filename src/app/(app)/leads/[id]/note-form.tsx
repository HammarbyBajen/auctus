"use client";

import { useActionState, useEffect, useRef } from "react";
import { addLeadNote, type NoteFormState } from "../actions";
import { t } from "@/lib/i18n";

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<NoteFormState, FormData>(
    addLeadNote.bind(null, leadId),
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) ref.current?.reset();
  }, [pending, state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-lg">
        {t("lead.noteLabel")}
        <textarea
          name="body"
          rows={3}
          className="rounded-lg border border-stone-300 bg-white px-3 py-3 text-lg"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-red-700">
          {t(state.error)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white disabled:opacity-60"
      >
        {t("lead.noteSubmit")}
      </button>
    </form>
  );
}
