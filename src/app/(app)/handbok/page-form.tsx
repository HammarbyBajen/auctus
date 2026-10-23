"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/app/native-select";
import { SubmitButton } from "@/components/app/submit-button";
import type { HandbookDoc } from "@/lib/handbook/document";
import { t } from "@/lib/i18n";
import { savePage, type PageFormState } from "./actions";
import { HandbookEditor } from "./editor";

/** Writing a routine (ticket 37): a title, a category and the text. */
export function PageForm({
  id,
  title,
  categoryId,
  content,
  categories,
}: {
  id: string | null;
  title: string;
  categoryId: string;
  content: HandbookDoc;
  categories: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<PageFormState, FormData>(savePage.bind(null, id), {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="handbook-title">{t("handbook.titleLabel")}</Label>
        <Input id="handbook-title" name="title" defaultValue={title} required maxLength={150} autoComplete="off" className="text-base" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="handbook-category">{t("handbook.categoryLabel")}</Label>
        <NativeSelect id="handbook-category" name="category" defaultValue={categoryId} required className="sm:max-w-xs">
          <option value="" disabled>
            {t("handbook.categoryPick")}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <span id="handbook-text-label" className="text-sm font-medium">
          {t("handbook.textLabel")}
        </span>
        <HandbookEditor initial={content} labelledBy="handbook-text-label" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(state.error)}
        </p>
      )}
      <SubmitButton className="self-start" pendingLabel={t("app.saving")}>
        {t("handbook.save")}
      </SubmitButton>
    </form>
  );
}
