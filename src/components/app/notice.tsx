import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: { className: "text-foreground", icon: Info },
  success: { className: "text-success", icon: CheckCircle2 },
  warning: { className: "text-warning", icon: TriangleAlert },
  danger: { className: "text-destructive", icon: AlertCircle },
} as const;

/**
 * A message. Status colours are tints with an icon and a word, never a solid
 * block. Errors are announced at once, everything else politely.
 */
export function Notice({ tone = "info", children, className }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string }) {
  const { className: toneClass, icon: Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 rounded-md px-4 py-3 text-sm",
        tone === "info" ? "bg-muted" : "chip-tint",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}
