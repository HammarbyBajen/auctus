import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * The product mark: a deliberately set typographic wordmark on a small tile.
 * GAP (docs/DESIGN.md D1): the final name and wordmark are Erik's and Max's call.
 */
export function Mark({ className, size = "sm" }: { className?: string; size?: "sm" | "lg" }) {
  return (
    <span translate="no" className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-xs bg-primary font-semibold tracking-tight text-primary-foreground",
          size === "lg" ? "size-9 text-sm" : "size-7 text-xs",
        )}
      >
        TH
      </span>
      <span className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-sm")}>{t("app.name")}</span>
    </span>
  );
}
