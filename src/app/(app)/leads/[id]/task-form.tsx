"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTask, type TaskFormState } from "../actions";
import { t } from "@/lib/i18n";

const input = "rounded-lg border border-stone-300 bg-white px-3 py-3 text-lg";

export function TaskForm({ leadId, today }: { leadId: string; today: string }) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(addTask.bind(null, leadId), {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) ref.current?.reset();
  }, [pending, state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-lg">
        {t("task.titleLabel")}
        <input name="title" maxLength={200} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        {t("task.dueLabel")}
        <input name="dueDate" type="date" defaultValue={today} className={input} />
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
        {t("task.add")}
      </button>
    </form>
  );
}
