"use client";

import { useActionState } from "react";
import { createLead, type LeadFormState } from "../actions";
import { leadSources } from "@/lib/leads/constants";
import { t, type MessageKey } from "@/lib/i18n";

const input = "rounded-lg border border-stone-300 bg-white px-3 py-3 text-lg";

export function LeadForm() {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(createLead, {});
  const values = state.values;

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-lg">
        {t("leadForm.name")}
        <input name="name" required defaultValue={values?.name} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        {t("leadForm.phone")}
        <input name="phone" type="tel" autoComplete="off" defaultValue={values?.phone} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        {t("leadForm.email")}
        <input name="email" type="email" autoComplete="off" defaultValue={values?.email} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        {t("leadForm.source")}
        <select name="source" defaultValue={values?.source ?? "manual"} className={input}>
          {leadSources.map((source) => (
            <option key={source} value={source}>
              {t(`source.${source}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      {state.error && (
        <p role="alert" className="text-red-700">
          {t(state.error)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-stone-900 px-4 py-3 text-lg font-medium text-white disabled:opacity-60"
      >
        {t("leadForm.submit")}
      </button>
    </form>
  );
}
