"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTask, type TaskFormState } from "../actions";
import { t } from "@/lib/i18n";

export function TaskForm({ leadId, today }: { leadId: string; today: string }) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(addTask.bind(null, leadId), {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) ref.current?.reset();
  }, [pending, state]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-title" className="text-base">
          {t("task.titleLabel")}
        </Label>
        <Input id="task-title" name="title" maxLength={200} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-due" className="text-base">
          {t("task.dueLabel")}
        </Label>
        <Input id="task-due" name="dueDate" type="date" defaultValue={today} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("app.saving") : t("task.add")}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-danger-text sm:col-span-3">
          {t(state.error)}
        </p>
      )}
    </form>
  );
}
