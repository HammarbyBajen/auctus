import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** "TEGEN HQ" set in the brand's heading face. Stands in until the official logo file is added. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span translate="no" className={cn("heading-display text-xl leading-none tracking-tight", className)}>
      {t("app.name")}
    </span>
  );
}
