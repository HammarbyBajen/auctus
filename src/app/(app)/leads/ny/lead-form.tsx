"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/app/native-select";
import { createLead, type LeadFormState } from "../actions";
import { leadSources } from "@/lib/leads/constants";
import { LeadFieldInputs, type LeadFieldDef } from "@/components/app/lead-fields";
import { t, type MessageKey } from "@/lib/i18n";

/** Which field each error belongs to, so it is shown and focused there. */
const fieldOf: Partial<Record<MessageKey, "name" | "phone" | "email">> = {
  "leadForm.errorName": "name",
  "leadForm.errorContact": "phone",
  "leadForm.errorEmail": "email",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}

export function LeadForm({ fields = [] }: { fields?: LeadFieldDef[] }) {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(createLead, {});
  const values = state.values;
  const errorField = state.error ? fieldOf[state.error] : undefined;
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // After a failed attempt, move focus to the field with the problem.
  useEffect(() => {
    const target = errorField === "name" ? nameRef : errorField === "phone" ? phoneRef : errorField === "email" ? emailRef : null;
    target?.current?.focus();
  }, [state, errorField]);

  const errorFor = (field: "name" | "phone" | "email") => (errorField === field && state.error ? t(state.error) : undefined);

  return (
    <form action={action} className="flex flex-col gap-5">

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">
          {t("leadForm.name")}
        </Label>
        <Input
          ref={nameRef}
          id="name"
          name="name"
          required
          autoComplete="off"
          defaultValue={values?.name}
          aria-invalid={errorField === "name" || undefined}
          aria-describedby={errorField === "name" ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errorFor("name")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">
          {t("leadForm.phone")}
        </Label>
        <Input
          ref={phoneRef}
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={values?.phone}
          aria-invalid={errorField === "phone" || undefined}
          aria-describedby={errorField === "phone" ? "phone-error phone-hint" : "phone-hint"}
        />
        <p id="phone-hint" className="text-xs text-muted-foreground">
          {t("leadForm.phoneHint")}
        </p>
        <FieldError id="phone-error" message={errorFor("phone")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">
          {t("leadForm.email")}
        </Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={values?.email}
          aria-invalid={errorField === "email" || undefined}
          aria-describedby={errorField === "email" ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={errorFor("email")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="source">
          {t("leadForm.source")}
        </Label>
        <NativeSelect id="source" name="source" defaultValue={values?.source ?? "manual"}>
          {leadSources.map((source) => (
            <option key={source} value={source}>
              {t(`source.${source}` as MessageKey)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {fields.length > 0 && <LeadFieldInputs fields={fields} values={values?.fields ?? {}} />}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <ButtonLink href="/leads" variant="ghost">
          {t("leadForm.cancel")}
        </ButtonLink>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("app.saving") : t("leadForm.submit")}
        </Button>
      </div>
    </form>
  );
}
