import { cn } from "@/lib/utils";

const tones = {
  info: "border-border bg-secondary text-foreground",
  success: "border-success-border bg-success-surface text-success-text",
  warning: "border-warning-border bg-warning-surface text-warning-text",
  danger: "border-danger-border bg-danger-surface text-danger-text",
} as const;

/** A message box. Errors are announced at once, everything else politely. */
export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn("rounded-md border px-4 py-3 text-base", tones[tone], className)}
    >
      {children}
    </div>
  );
}
