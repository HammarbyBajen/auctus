"use client";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/app/native-select";
import { t } from "@/lib/i18n";

/**
 * Who is responsible, changed right in the lead's header: picking a person
 * saves at once. Without JavaScript a Spara button does it instead.
 */
export function AssigneeSelect({
  action,
  value,
  people,
}: {
  action: (formData: FormData) => Promise<void>;
  value: string;
  people: { id: string; name: string }[];
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      <NativeSelect
        name="assignee"
        defaultValue={value}
        aria-label={t("assign.title")}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 w-auto min-w-40 sm:h-8"
      >
        <option value="">{t("assign.nobody")}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {t("assign.assignedTo", { name: p.name })}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" variant="outline" className="js:hidden">
        {t("assign.save")}
      </Button>
    </form>
  );
}
