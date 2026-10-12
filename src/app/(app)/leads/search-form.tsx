"use client";

import Form from "next/form";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/native-select";
import type { LeadFilters } from "@/lib/leads/search";
import { t } from "@/lib/i18n";

type Option = { value: string; label: string };

/**
 * Search and filters for the leads page: one row above the content it scopes.
 * A GET form (next/form: a client-side navigation once loaded, a plain form
 * before), so the address holds the view; picking a filter applies it at once,
 * the search applies on Enter or the button.
 */
export function SearchForm({
  filters,
  stages,
  sources,
  assignees,
  periods,
  active,
}: {
  filters: LeadFilters;
  stages: Option[];
  sources: Option[];
  assignees: Option[];
  periods: Option[];
  active: boolean;
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  // Leave empty fields out of the address (?q=anna, not ?q=anna&fas=&kalla=...): a disabled
  // field is skipped when next/form reads the form, which it does right after this runs.
  const dropEmpty = (e: React.FormEvent<HTMLFormElement>) => {
    for (const el of Array.from(e.currentTarget.elements)) {
      if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name && el.value.trim() === "") {
        el.disabled = true;
        setTimeout(() => (el.disabled = false));
      }
    }
  };
  const assignee = filters.assignee === "mine" ? "mina" : filters.assignee === "none" ? "ingen" : filters.assignee;
  const select = (name: string, label: string, value: string, options: Option[]) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="sr-only">{label}</span>
      <NativeSelect name={name} defaultValue={value} onChange={submit} aria-label={label}>
        <option value="">{label}: {t("search.any")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <Form action="/leads" role="search" onSubmit={dropEmpty} className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={t("search.placeholder")}
            aria-label={t("search.label")}
            autoComplete="off"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          {t("search.submit")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:w-auto">
        {select("fas", t("search.stage"), filters.stage, stages)}
        {select("kalla", t("search.source"), filters.source, sources)}
        {select("ansvarig", t("search.assignee"), assignee, assignees)}
        {select("period", t("search.period"), filters.period, periods)}
      </div>
      {active && (
        <Link href="/leads" className="focus-ring inline-flex min-h-11 items-center gap-1 self-start rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground sm:min-h-9 lg:self-auto">
          <X aria-hidden="true" className="size-4" />
          {t("search.clear")}
        </Link>
      )}
    </Form>
  );
}
