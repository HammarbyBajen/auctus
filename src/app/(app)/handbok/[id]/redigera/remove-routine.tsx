"use client";

import { Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/app/submit-button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** "Ta bort rutinen": a button like Spara, in red, that asks before anything is removed (ticket 37). */
export function RemoveRoutine({ action }: { action: () => Promise<void> }) {
  return (
    <details className="group flex flex-col self-start">
      <summary className={cn(buttonVariants({ variant: "destructive" }), "min-h-11 cursor-pointer list-none px-4 sm:min-h-9 [&::-webkit-details-marker]:hidden")}>
        <Trash2 aria-hidden="true" />
        {t("handbook.remove")}
      </summary>
      <form action={action} className="mt-3 flex max-w-md flex-col gap-3 rounded-md bg-well p-3">
        <p className="text-sm text-muted-foreground">{t("handbook.removeConfirm")}</p>
        <SubmitButton variant="destructive" className="self-start">
          <Trash2 aria-hidden="true" />
          {t("handbook.removeSubmit")}
        </SubmitButton>
      </form>
    </details>
  );
}
