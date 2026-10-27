"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatHours } from "@/lib/format";
import { t } from "@/lib/i18n";

type Group = { key: string; title: string; types: { typeKey: string; label: string; hours: number; counted: boolean }[] };

/**
 * Timmar's categories to tick, with Markera alla and Avmarka alla: they only
 * change the ticks; Spara urval below saves them, as before.
 */
export function CategoryChecks({ groups, locked }: { groups: Group[]; locked: boolean }) {
  const all = groups.flatMap((g) => g.types);
  const [counted, setCounted] = useState(() => new Set(all.filter((ty) => ty.counted).map((ty) => ty.typeKey)));
  const toggle = (typeKey: string, on: boolean) =>
    setCounted((current) => {
      const next = new Set(current);
      if (on) next.add(typeKey);
      else next.delete(typeKey);
      return next;
    });

  return (
    <>
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={counted.size === all.length} onClick={() => setCounted(new Set(all.map((ty) => ty.typeKey)))}>
            {t("salary.selectAll")}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={counted.size === 0} onClick={() => setCounted(new Set())}>
            {t("salary.deselectAll")}
          </Button>
        </div>
      )}
      {groups.map((g) => (
        <fieldset key={g.key} className="flex flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">{g.title}</legend>
          {g.types.map((ty) => (
            <Label key={ty.typeKey} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent has-disabled:cursor-default has-disabled:hover:bg-transparent sm:min-h-9">
              <input type="hidden" name="shown" value={ty.typeKey} />
              <Checkbox name="counted" value={ty.typeKey} checked={counted.has(ty.typeKey)} onCheckedChange={(on) => toggle(ty.typeKey, on)} disabled={locked} />
              <span className="min-w-0 flex-1">{ty.label}</span>
              <span className="tabular-nums text-muted-foreground">{formatHours(ty.hours)} h</span>
            </Label>
          ))}
        </fieldset>
      ))}
    </>
  );
}
